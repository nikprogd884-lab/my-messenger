import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mzziirgdhvbubiunykuj.supabase.co";
const SUPABASE_KEY = "sb_publishable_CjKU3ZHBcAjUbD0YjWodYQ_esxjkufl";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(function(w) { return w[0]; }).join("").toUpperCase().slice(0, 2);
}
function hashColor(str) {
  if (!str) return "#6366f1";
  var h = 0;
  for (var i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  var colors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];
  return colors[Math.abs(h) % colors.length];
}
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  var [user, setUser] = useState(null);
  var [screen, setScreen] = useState("login");
  var [email, setEmail] = useState("");
  var [pass, setPass] = useState("");
  var [username, setUsername] = useState("");
  var [authError, setAuthError] = useState("");
  var [contacts, setContacts] = useState([]);
  var [activeContact, setActiveContact] = useState(null);
  var [messages, setMessages] = useState([]);
  var [input, setInput] = useState("");
  var [searchEmail, setSearchEmail] = useState("");
  var [searchResult, setSearchResult] = useState(null);
  var [searchError, setSearchError] = useState("");
  var [showSearch, setShowSearch] = useState(false);
  var [sending, setSending] = useState(false);
  var bottomRef = useRef(null);
  var subRef = useRef(null);

  useEffect(function() {
    supabase.auth.getSession().then(function(res) {
      var data = res.data;
      if (data.session && data.session.user) {
        setUser(data.session.user);
        setScreen("chat");
        loadContacts(data.session.user.id);
      }
    });
    var sub = supabase.auth.onAuthStateChange(function(e, session) {
      if (session && session.user) {
        setUser(session.user);
        setScreen("chat");
        loadContacts(session.user.id);
      } else {
        setUser(null);
        setScreen("login");
      }
    });
    return function() { sub.data.subscription.unsubscribe(); };
  }, []);

  function loadContacts(uid) {
    var stored = localStorage.getItem("sb_contacts_" + uid);
    if (stored) setContacts(JSON.parse(stored));
  }

  function saveContacts(uid, list) {
    localStorage.setItem("sb_contacts_" + uid, JSON.stringify(list));
    setContacts(list);
  }

  async function handleLogin() {
    setAuthError("");
    var res = await supabase.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) setAuthError("Неверный email или пароль");
  }

  async function handleRegister() {
    setAuthError("");
    if (!username.trim()) { setAuthError("Введите имя"); return; }
    var res = await supabase.auth.signUp({
      email: email,
      password: pass,
      options: { data: { username: username } }
    });
    if (res.error) setAuthError(res.error.message);
    else setAuthError("ok");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setContacts([]);
    setActiveContact(null);
    setMessages([]);
  }

  var loadMessages = useCallback(async function() {
    if (!activeContact || !user) return;
    var res = await supabase
      .from("messages")
      .select("*")
      .or("and(sender_id.eq." + user.id + ",receiver_id.eq." + activeContact.id + "),and(sender_id.eq." + activeContact.id + ",receiver_id.eq." + user.id + ")")
      .order("created_at", { ascending: true });
    setMessages(res.data || []);
  }, [activeContact, user]);

  useEffect(function() {
    if (!activeContact || !user) return;
    if (subRef.current) subRef.current.unsubscribe();
    loadMessages();
    subRef.current = supabase
      .channel("msg_" + [user.id, activeContact.id].sort().join("_"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, function(payload) {
        var m = payload.new;
        if (
          (m.sender_id === user.id && m.receiver_id === activeContact.id) ||
          (m.sender_id === activeContact.id && m.receiver_id === user.id)
        ) {
          setMessages(function(prev) { return prev.concat([m]); });
        }
      })
      .subscribe();
    return function() { if (subRef.current) subRef.current.unsubscribe(); };
  }, [activeContact, user, loadMessages]);

  useEffect(function() {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function searchUser() {
    setSearchError("");
    setSearchResult(null);
    if (!searchEmail.trim()) return;
    var res = await supabase.from("profiles").select("*").eq("email", searchEmail.trim()).single();
    if (!res.data) { setSearchError("Пользователь не найден"); return; }
    if (res.data.id === user.id) { setSearchError("Это ваш аккаунт"); return; }
    setSearchResult(res.data);
  }

  function addContact(c) {
    if (contacts.find(function(x) { return x.id === c.id; })) { setSearchError("Уже в контактах"); return; }
    var updated = contacts.concat([c]);
    saveContacts(user.id, updated);
    setShowSearch(false);
    setSearchEmail("");
    setSearchResult(null);
    setActiveContact(c);
  }

  async function sendMessage() {
    if (!input.trim() || !activeContact || sending) return;
    setSending(true);
    await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: activeContact.id,
      text: input.trim()
    });
    setInput("");
    setSending(false);
  }

  var myName = (user && user.user_metadata && user.user_metadata.username) ? user.user_metadata.username : (user ? user.email : "");

  if (screen === "login" || screen === "register") {
    var isLogin = screen === "login";
    return (
      <div style={S.authBg}>
        <div style={S.authCard}>
          <div style={S.logo}>💬</div>
          <h1 style={S.title}>Мессенджер</h1>
          <p style={S.sub}>Общайтесь свободно</p>
          <div style={S.tabs}>
            <button style={Object.assign({}, S.tab, isLogin ? S.tabOn : {})} onClick={function() { setScreen("login"); setAuthError(""); }}>Войти</button>
            <button style={Object.assign({}, S.tab, !isLogin ? S.tabOn : {})} onClick={function() { setScreen("register"); setAuthError(""); }}>Регистрация</button>
          </div>
          {!isLogin && <input style={S.inp} placeholder="Ваше имя" value={username} onChange={function(e) { setUsername(e.target.value); }} />}
          <input style={S.inp} placeholder="Email" type="email" value={email} onChange={function(e) { setEmail(e.target.value); }} />
          <input style={S.inp} placeholder="Пароль (мин. 6 символов)" type="password" value={pass} onChange={function(e) { setPass(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") { if (isLogin) handleLogin(); else handleRegister(); } }} />
          {authError === "ok" && <div style={{color:"#4ade80",fontSize:13,marginBottom:8,textAlign:"center"}}>✅ Аккаунт создан! Войдите.</div>}
          {authError && authError !== "ok" && <div style={{color:"#f87171",fontSize:13,marginBottom:8,textAlign:"center"}}>{authError}</div>}
          <button style={S.btn} onClick={isLogin ? handleLogin : handleRegister}>{isLogin ? "Войти" : "Создать аккаунт"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.sidebar}>
        <div style={S.sideTop}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={Object.assign({}, S.avatar, {background:hashColor(user ? user.id : ""), fontSize:13})}>{getInitials(myName)}</div>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{myName}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{user ? user.email : ""}</div>
            </div>
          </div>
          <button style={S.iconBtn} onClick={handleLogout}>⏏</button>
        </div>
        <div style={{padding:"10px 14px"}}>
          <button style={S.newBtn} onClick={function() { setShowSearch(!showSearch); }}>
            {showSearch ? "✕ Закрыть" : "+ Новый чат"}
          </button>
        </div>
        {showSearch && (
          <div style={S.searchBox}>
            <input style={S.searchInp} placeholder="Email пользователя" value={searchEmail} onChange={function(e) { setSearchEmail(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") searchUser(); }} />
            <button style={S.searchBtn} onClick={searchUser}>Найти</button>
            {searchError && <div style={{color:"#f87171",fontSize:12,padding:"4px 0"}}>{searchError}</div>}
            {searchResult && (
              <div style={S.result}>
                <div style={Object.assign({}, S.avatar, {background:hashColor(searchResult.id),fontSize:12,width:32,height:32})}>
                  {getInitials(searchResult.username || searchResult.email)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{searchResult.username}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{searchResult.email}</div>
                </div>
                <button style={S.addBtn} onClick={function() { addContact(searchResult); }}>+</button>
              </div>
            )}
          </div>
        )}
        <div style={S.contactList}>
          {contacts.length === 0 && (
            <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:"24px 16px"}}>
              Нет контактов.<br />Нажмите «+ Новый чат»
            </div>
          )}
          {contacts.map(function(c) {
            return (
              <div key={c.id} style={Object.assign({}, S.contactItem, activeContact && activeContact.id === c.id ? S.contactOn : {})} onClick={function() { setActiveContact(c); }}>
                <div style={Object.assign({}, S.avatar, {background:hashColor(c.id),fontSize:13})}>{getInitials(c.username || c.email)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.username}</div>
                  <div style={{fontSize:11,color:"#475569",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.email}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.chat}>
        {!activeContact ? (
          <div style={S.empty}>
            <div style={{fontSize:56,marginBottom:12}}>💬</div>
            <div style={{color:"#475569",fontSize:16}}>Выберите чат слева</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",flex:1}}>
            <div style={S.chatTop}>
              <div style={Object.assign({}, S.avatar, {background:hashColor(activeContact.id),fontSize:14})}>{getInitials(activeContact.username || activeContact.email)}</div>
              <div>
                <div style={{fontWeight:700,color:"#f1f5f9"}}>{activeContact.username}</div>
                <div style={{fontSize:12,color:"#64748b"}}>{activeContact.email}</div>
              </div>
            </div>
            <div style={S.msgs}>
              {messages.map(function(m) {
                var mine = m.sender_id === user.id;
                return (
                  <div key={m.id} style={{display:"flex",justifyContent:mine?"flex-end":"flex-start",marginBottom:8}}>
                    <div style={Object.assign({}, S.bubble, mine ? S.bubbleMine : S.bubbleOther)}>
                      <div style={{fontSize:15}}>{m.text}</div>
                      <div style={{fontSize:10,color:mine?"rgba(255,255,255,0.55)":"#64748b",marginTop:3,textAlign:"right"}}>{formatTime(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div style={S.inputRow}>
              <input style={S.msgInp} placeholder="Написать сообщение..." value={input} onChange={function(e) { setInput(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter" && !e.shiftKey) sendMessage(); }} />
              <button style={Object.assign({}, S.sendBtn, {opacity: sending || !input.trim() ? 0.4 : 1})} onClick={sendMessage} disabled={sending || !input.trim()}>➤</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

var S = {
  authBg:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0f172a",fontFamily:"'Segoe UI',sans-serif"},
  authCard:{background:"#1e293b",borderRadius:20,padding:"40px 36px",width:340,boxShadow:"0 25px 60px rgba(0,0,0,0.5)"},
  logo:{fontSize:48,textAlign:"center",marginBottom:8},
  title:{color:"#f1f5f9",fontSize:28,fontWeight:800,textAlign:"center",margin:0},
  sub:{color:"#64748b",fontSize:14,textAlign:"center",marginBottom:24,marginTop:4},
  tabs:{display:"flex",background:"#0f172a",borderRadius:10,padding:4,marginBottom:20},
  tab:{flex:1,padding:"8px 0",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:600,background:"transparent",color:"#64748b"},
  tabOn:{background:"#6366f1",color:"#fff"},
  inp:{width:"100%",boxSizing:"border-box",padding:"12px 16px",marginBottom:12,background:"#0f172a",border:"1.5px solid #334155",borderRadius:10,color:"#f1f5f9",fontSize:15,outline:"none"},
  btn:{width:"100%",padding:"13px 0",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:"pointer",marginTop:4},
  wrap:{display:"flex",height:"100vh",background:"#0f172a",fontFamily:"'Segoe UI',sans-serif"},
  sidebar:{width:290,minWidth:250,background:"#1e293b",display:"flex",flexDirection:"column",borderRight:"1px solid #334155"},
  sideTop:{padding:"16px 14px",borderBottom:"1px solid #334155",display:"flex",alignItems:"center",justifyContent:"space-between"},
  avatar:{width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,flexShrink:0},
  iconBtn:{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:18,padding:4},
  newBtn:{width:"100%",padding:"9px 0",background:"#6366f1",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"},
  searchBox:{padding:"10px 14px",borderBottom:"1px solid #334155",background:"#0f172a"},
  searchInp:{width:"100%",boxSizing:"border-box",padding:"9px 12px",background:"#1e293b",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:13,outline:"none",marginBottom:8},
  searchBtn:{width:"100%",padding:"8px 0",background:"#334155",color:"#cbd5e1",border:"none",borderRadius:8,cursor:"pointer",fontSize:13},
  result:{display:"flex",alignItems:"center",gap:8,marginTop:10,padding:8,background:"#1e293b",borderRadius:8},
  addBtn:{background:"#6366f1",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:16,fontWeight:700},
  contactList:{flex:1,overflowY:"auto"},
  contactItem:{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"},
  contactOn:{background:"#334155"},
  chat:{flex:1,display:"flex",flexDirection:"column",background:"#0f172a"},
  empty:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"},
  chatTop:{padding:"14px 20px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:12,background:"#1e293b"},
  msgs:{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column"},
  bubble:{maxWidth:"65%",padding:"10px 14px",borderRadius:16,lineHeight:1.5},
  bubbleMine:{background:"#6366f1",color:"#fff",borderBottomRightRadius:4},
  bubbleOther:{background:"#1e293b",color:"#e2e8f0",borderBottomLeftRadius:4},
  inputRow:{padding:"16px 20px",borderTop:"1px solid #1e293b",display:"flex",gap:10,background:"#1e293b"},
  msgInp:{flex:1,padding:"12px 16px",background:"#0f172a",border:"1.5px solid #334155",borderRadius:12,color:"#f1f5f9",fontSize:15,outline:"none"},
  sendBtn:{width:48,height:48,background:"#6366f1",border:"none",borderRadius:12,color:"#fff",fontSize:18,cursor:"pointer"}
};
```

Вставь в App.js (**Ctrl+A** → **Delete** → **Ctrl+V** → **Ctrl+S**), потом:
```
git add .
git commit -m "fix4"
git push