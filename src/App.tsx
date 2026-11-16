import {useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "./lib/supabase";
import type {Complaint,Profile,Role,Status} from "./types";
import {scorePriority,similarity} from "./utils/priority";
import {Activity,AlertCircle,ArrowRight,BarChart3,CheckCircle2,ClipboardList,CloudUpload,LogIn,LogOut,Menu,Plus,Search,ShieldCheck,Users,Wrench,Bell,Camera,Image as ImageIcon, X, LayoutDashboard} from "lucide-react";
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,PieChart,Pie,Cell} from "recharts";
import {Check,Info,TriangleAlert} from "lucide-react";

const COLLEGE_EMAIL_DOMAINS=["skct.edu.in","skcet.ac.in"];
const isCollegeEmail=(email:string)=>COLLEGE_EMAIL_DOMAINS.some(domain=>email.trim().toLowerCase().endsWith("@"+domain));
const categories=["Electrical Issues","Internet and Wi-Fi","Laboratory Equipment","Classroom Infrastructure","Water Supply","Sanitation and Cleanliness","Furniture and Facilities","Other Issues"];
const depts=["Electronics and Communication Engineering (ECE)","Computer Science and Engineering (CSE)","Information Technology (IT)","Electrical and Electronics Engineering (EEE)","Mechanical Engineering","Civil Engineering","Artificial Intelligence and Data Science (AI & DS)","Other"];
const statuses:Status[]=["Submitted","Under Review","Assigned","In Progress","Resolved","Closed","Reopened","Escalated"];
function App(){
 const [session,setSession]=useState<any>(null),[profile,setProfile]=useState<Profile|null>(null),[profileLoading,setProfileLoading]=useState(false),[page,setPage]=useState("home"),[complaints,setComplaints]=useState<Complaint[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[authMode,setAuthMode]=useState<"login"|"student-signup"|"staff-signup">("login"),[navOpen,setNavOpen]=useState(false),[unreadCount,setUnreadCount]=useState(0),[toastKind,setToastKind]=useState<"success"|"error"|"info">("info");
 const authEventSeen=useRef(false);
 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
   authEventSeen.current=true;
   if(active)setSession(nextSession);
  });
  supabase.auth.getSession().then(({data,error})=>{
   if(active&&!authEventSeen.current){
    if(error)setNotice(`Unable to check your sign-in session: ${error.message}`);
    setSession(data.session);
   }
  });
  return()=>{active=false;subscription.unsubscribe()};
 },[]);
 useEffect(()=>{
  const client=supabase;
  const userId=session?.user?.id;
  if(!client||!userId){
   setProfile(null);
   setProfileLoading(false);
   return;
  }
  let active=true;
  setProfile(null);
  setProfileLoading(true);
  const load=async()=>{
   const {data,error}=await client.from("profiles").select("*").eq("id",userId).single();
   if(!active)return;
   if(error||!data){
    setProfile(null);
    setProfileLoading(false);
    setNotice(`Unable to load your account profile${error?.message?`: ${error.message}`:". Please contact the administrator."}`);
    return;
   }
   setProfile(data as Profile);
   setPage(data.role==="admin"?"admin":data.role==="staff"?"staff":"dashboard");
   setProfileLoading(false);
  };
  void load();
  return()=>{active=false};
 },[session?.user?.id]);
 async function loadComplaints(){if(!supabase)return;setBusy(true);let q=supabase.from("complaints").select("*").order("submitted_at",{ascending:false}).limit(100);if(profile?.role==="student")q=q.eq("student_id",profile.id);if(profile?.role==="staff")q=q.eq("assigned_staff_id",profile.id);const {data,error}=await q;if(error)setNotice(error.message);else setComplaints((data||[]) as Complaint[]);setBusy(false)}
 useEffect(()=>{if(profile)loadComplaints()},[profile]);
 useEffect(()=>{if(!notice)return;const kind=/error|failed|invalid|unable|missing/i.test(notice)?"error":/saved|updated|submitted|resolved|assigned|success|read|created|deleted|removed|uploaded/i.test(notice)?"success":"info";setToastKind(kind as any);const timer=window.setTimeout(()=>setNotice(""),4600);return()=>window.clearTimeout(timer)},[notice]);
 useEffect(()=>{const client=supabase;const currentProfile=profile;if(!client||!currentProfile)return;let active=true;const loadUnread=async()=>{const {count,error}=await client.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",currentProfile.id).eq("is_read",false);if(active&&!error)setUnreadCount(count||0)};loadUnread();const channel=client.channel(`app-notifications-${currentProfile.id}`).on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`user_id=eq.${currentProfile.id}`},payload=>{loadUnread();if(payload.eventType==="INSERT"){const n=payload.new as any;setNotice(`${n.title}: ${n.message}`)}}).subscribe();return()=>{active=false;void client.removeChannel(channel)}},[profile?.id]);
 async function signOut(){await supabase?.auth.signOut();setSession(null);setProfile(null);setPage("home")}
 const isAdmin=profile?.role==="admin";
 if(!supabase)return <div className="setup"><div className="brand-mark">CP</div><h1>CampusPulse setup needed</h1><p>Configure your Supabase project to activate authentication, data storage and role-based dashboards.</p><code>Copy .env.example to .env and add your Supabase URL + publishable key.</code><p>Then run <b>npm install</b> and <b>npm run dev</b>.</p></div>;
 return <div className="app blue-app">
  <aside className={`app-sidebar ${navOpen?"sidebar-open":""}`}>
   <a className="brand sidebar-brand" onClick={()=>setPage("home")}><span className="brand-mark">CP</span><span>Campus<span className="brand-blue">Pulse</span><small>Smart Campus Complaint System</small></span></a>
   <nav className="sidebar-nav">
    {session?<>
     <button className={page==="dashboard"?"active":""} onClick={()=>setPage("dashboard")}><LayoutDashboard size={18}/>Dashboard</button>
     {isAdmin&&<><button className={page==="admin"?"active":""} onClick={()=>setPage("admin")}><Users size={18}/>Management</button><button className={page==="analytics"?"active":""} onClick={()=>setPage("analytics")}><BarChart3 size={18}/>Analytics</button></>}
     {profile?.role==="staff"&&<button className={page==="staff"?"active":""} onClick={()=>setPage("staff")}><ClipboardList size={18}/>My tasks</button>}
     <button className={page==="submit"?"active":""} onClick={()=>setPage("submit")}><Plus size={18}/>Register Complaint</button>
     <button className={page==="notifications"?"active":""} onClick={()=>setPage("notifications")}><Bell size={18}/>Notifications{unreadCount>0&&<span className="nav-badge">{unreadCount>99?"99+":unreadCount}</span>}</button>
    </>:<><button className={page==="home"?"active":""} onClick={()=>setPage("home")}><LayoutDashboard size={18}/>Home</button><button onClick={()=>setPage("submit")}><Plus size={18}/>Register Complaint</button><button onClick={()=>setPage("guest-track")}><ClipboardList size={18}/>Track Guest Report</button><button onClick={()=>{setPage("auth");setAuthMode("login")}}><LogIn size={18}/>Sign in</button></>}
   </nav>
   {session&&<div className="sidebar-user"><div className="user-avatar">{(profile?.full_name||session.user.email||"D").slice(0,1).toUpperCase()}</div><div><b>{profile?.full_name||"CampusPulse User"}</b><small>{profileLoading?"Loading role…":profile?profile.role.charAt(0).toUpperCase()+profile.role.slice(1):"Profile unavailable"}</small></div><button title="Sign out" onClick={signOut}><LogOut size={17}/></button></div>}
  </aside>
  <div className="app-main"><header className="topbar blue-topbar"><button className="mobile-menu" onClick={()=>setNavOpen(!navOpen)}><Menu/></button><div className="topbar-title"><LayoutDashboard size={20}/><b>{({dashboard:"Dashboard",admin:"Management",analytics:"Analytics",staff:"My tasks",submit:"Register Complaint",notifications:"Notifications",auth:"Sign in",home:"CampusPulse", "guest-track":"Track Complaint"} as any)[page]||"CampusPulse"}</b></div><div className="topbar-actions">{session&&<button className="topbar-bell" onClick={()=>setPage("notifications")} aria-label="Open notifications"><Bell size={19}/>{unreadCount>0&&<span className="nav-badge">{unreadCount>99?"99+":unreadCount}</span>}</button>}<span className="topbar-user">{profile?.full_name?.split(" ")[0]||"Welcome"}</span></div></header>
  {notice&&<div className={`toast toast-${toastKind}`} role="status"><span className="toast-icon">{toastKind==="success"?<Check size={19}/>:toastKind==="error"?<TriangleAlert size={19}/>:<Info size={19}/>}</span><div className="toast-content"><b>{toastKind==="success"?"Action completed":toastKind==="error"?"Action failed":"CampusPulse update"}</b><p>{notice}</p></div><button className="toast-close" aria-label="Dismiss notification" onClick={()=>setNotice("")}><X size={17}/></button><span className="toast-progress"/></div>}
  {page==="home"&&<Landing onReport={()=>setPage("submit")} onAuth={()=>setPage("auth")}/>}
  {page==="auth"&&<Auth mode={authMode} changeMode={setAuthMode} onMessage={setNotice}/>}
  {page==="guest-track"&&<GuestTracking onMessage={setNotice}/>}
  {page==="submit"&&!session&&<div className="auth-wrap"><div className="panel auth-card"><h2>College sign-in required</h2><p>Only signed-in students using @skct.edu.in or @skcet.ac.in accounts can submit complaints.</p><button className="btn full" onClick={()=>{setPage("auth");setAuthMode("login")}}>Sign in to continue</button></div></div>}{page==="submit"&&session&&<ComplaintForm session={session} onMessage={setNotice} onDone={(ref)=>{setNotice(`Complaint saved: ${ref}`);setPage("dashboard");loadComplaints()}} onCancel={()=>setPage("dashboard")} existing={complaints}/>}
  {page==="dashboard"&&profile&&<Dashboard profile={profile} complaints={complaints} refresh={loadComplaints} onSubmit={()=>setPage("submit")}/>}
  {page==="admin"&&profile?.role==="admin"&&<Admin complaints={complaints} refresh={loadComplaints} onMessage={setNotice}/>}
  {page==="analytics"&&profile?.role==="admin"&&<Analytics complaints={complaints}/>}
  {page==="notifications"&&session&&<Notifications profile={profile} onMessage={setNotice}/>}
  {page==="staff"&&profile?.role==="staff"&&<Staff complaints={complaints} refresh={loadComplaints} onMessage={setNotice}/>}
  {session&&profileLoading&&<div className="loading">Loading your account and access permissions…</div>}{session&&!profileLoading&&!profile&&page!=="auth"&&<div className="loading">Your account profile could not be loaded. Please sign out and try again. If the problem continues, contact the administrator.</div>}
  <footer>© {new Date().getFullYear()} CampusPulse <span>•</span> Smart campus issue resolution</footer>
  </div></div>
}
function Landing({onReport,onAuth}:{onReport:()=>void;onAuth:()=>void}){return <main>
 <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="pulse-dot"/> SMART CAMPUS OPERATIONS</div><h1>Make campus better.<br/><span>One issue at a time.</span></h1><p>Report campus problems, follow every update, and help your institution resolve issues with clarity and accountability.</p><div className="hero-actions"><button className="btn big" onClick={onReport}><Plus size={18}/> Report an issue <ArrowRight size={17}/></button><button className="btn outline big" onClick={onAuth}>Sign in to track</button></div><div className="trust"><ShieldCheck size={17}/> Transparent reporting · Accountable resolution</div></div>
 <div className="hero-art"><div className="mock-window"><div className="mock-head"><div className="dots"><i/><i/><i/></div><span>CampusPulse / Overview</span><Activity size={16}/></div><div className="mock-stat"><div><small>Open issues</small><h2>Live campus operations</h2></div><span className="status-pill amber">● Needs attention</span></div><div className="mock-row"><span className="mock-icon blue"><Wrench/></span><div><b>Lab computer not starting</b><small>IT Block · Lab 3</small></div><span className="status-pill blue">In progress</span></div><div className="mock-row"><span className="mock-icon cyan"><Activity/></span><div><b>Wi-Fi signal interruption</b><small>Main Block · Floor 2</small></div><span className="status-pill amber">Under review</span></div><div className="mock-row"><span className="mock-icon green"><CheckCircle2/></span><div><b>Water dispenser repaired</b><small>Library · Ground floor</small></div><span className="status-pill green">Resolved</span></div><div className="mock-bottom"><div><small>Resolution workflow</small><div className="progress"><i/></div></div><b>Trackable</b></div></div><div className="float-tag"><CheckCircle2 size={17}/> Clear updates, every step</div></div></section>
 <section className="features"><div className="section-head"><div className="eyebrow">BUILT FOR YOUR CAMPUS</div><h2>From report to resolution,<br/>without the guesswork.</h2><p>A shared workspace for students, administrators, and maintenance teams.</p></div><div className="feature-grid"><Feature icon={<ClipboardList/>} title="Easy issue reporting" text="Describe a problem, pinpoint its location, and add photo evidence in minutes."/><Feature icon={<Activity/>} title="Transparent tracking" text="Follow status updates and a complaint timeline from submission to closure."/><Feature icon={<ShieldCheck/>} title="Accountable workflows" text="Role-based access, staff assignment, priority rules, and audit history."/><Feature icon={<BarChart3/>} title="Actionable insights" text="Help administrators identify recurring issues and monitor resolution performance."/></div></section>
 <section className="how"><div><div className="eyebrow">HOW IT WORKS</div><h2>Simple for students.<br/>Useful for campus teams.</h2></div><div className="steps"><div><b>01</b><section><h3>Report</h3><p>Submit the issue with a location and optional evidence. Guest reporting is available.</p></section></div><div><b>02</b><section><h3>Review & assign</h3><p>Campus administrators assess priority and route the issue to relevant staff.</p></section></div><div><b>03</b><section><h3>Resolve & learn</h3><p>Staff update progress; students track resolution and share feedback.</p></section></div></div></section>
 <section className="cta"><div><h2>See something that needs fixing?</h2><p>Help your campus team get the right information to act.</p></div><button className="btn big white" onClick={onReport}>Report a campus issue <ArrowRight size={18}/></button></section>
 </main>}
function Feature({icon,title,text}:{icon:any;title:string;text:string}){return <article className="feature"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>}
function Auth({
  mode,
  changeMode,
  onMessage,
}: {
  mode: "login" | "student-signup" | "staff-signup";
  changeMode: (m: "login" | "student-signup" | "staff-signup") => void;
  onMessage: (s: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showActivationFields, setShowActivationFields] = useState(false);
  const isSignup = mode !== "login";
  const isStaffSignup = mode === "staff-signup";

  async function completeStaffInvitation(userEmail: string, code: string, staffId: string) {
    const { data, error } = await supabase!.functions.invoke("staff-invitations", {
      body: { action: "complete-registration", invitationCode: code, staffCode: staffId },
    });
    if (error || data?.error) {
      onMessage(data?.error || error?.message || "Staff invitation verification failed. Please contact the administrator.");
      return false;
    }
    localStorage.removeItem("campuspulse_pending_staff_invitation");
    await supabase!.auth.refreshSession();
    onMessage("Staff invitation verified. Your staff account is now activated.");
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const normalizedEmail = email.trim().toLowerCase();

    if ((isSignup || isCollegeEmail(normalizedEmail)) && !isCollegeEmail(normalizedEmail)) {
      onMessage("Use your official college email ending in @skct.edu.in or @skcet.ac.in.");
      return;
    }
    if (isStaffSignup && (!staffCode.trim() || !invitationCode.trim())) {
      onMessage("Enter the Staff ID and invitation code provided by the administrator.");
      return;
    }

    setLoading(true);

    if (isStaffSignup) {
      // The Edge Function validates the admin-issued email/Staff-ID-bound,
      // single-use invitation before creating and confirming the Auth user.
      // Project-wide email confirmation remains enabled for student signups.
      const { data: registration, error: registrationError } = await supabase.functions.invoke("staff-invitations", {
        body: {
          action: "register-staff",
          email: normalizedEmail,
          password,
          fullName: name.trim(),
          staffCode: staffCode.trim(),
          invitationCode: invitationCode.trim(),
        },
      });

      if (registrationError || registration?.error || registration?.success !== true) {
        setLoading(false);
        onMessage(registration?.error || registrationError?.message || "Staff registration failed. Check the invitation details and try again.");
        return;
      }

      // The Edge Function has confirmed the staff Auth user and assigned the
      // staff role. Sign in normally so the app receives a client session.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      setLoading(false);
      if (signInError) {
        onMessage("Staff account created and activated. Please sign in using your college email and password.");
        changeMode("login");
        return;
      }
      localStorage.removeItem("campuspulse_pending_staff_invitation");
      onMessage("Staff account created and activated successfully. You can now access CampusPulse.");
      return;
    }

    if (isSignup) {
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { full_name: name.trim() } },
      });
      setLoading(false);
      if (error) {
        onMessage(error.message);
        return;
      }
      onMessage("Student registration submitted. Check your college email to verify your account.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      setLoading(false);
      onMessage(error.message);
      return;
    }

    const pending = localStorage.getItem("campuspulse_pending_staff_invitation");
    if (pending && data.user?.email?.toLowerCase() === normalizedEmail) {
      try {
        const parsed = JSON.parse(pending);
        await completeStaffInvitation(normalizedEmail, parsed.code, parsed.staffCode);
      } catch {
        onMessage("Could not complete staff activation. Please enter your invitation details again.");
      }
    } else if (showActivationFields && invitationCode.trim() && staffCode.trim()) {
      await completeStaffInvitation(normalizedEmail, invitationCode.trim(), staffCode.trim());
    } else {
      onMessage("Signed in successfully.");
    }
    setLoading(false);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setLoading(false);
      onMessage(error.message);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="panel auth-card auth-card-role" onSubmit={submit}>
        <div className="feature-icon"><ShieldCheck /></div>
        <h2>{mode === "login" ? "Welcome back" : isStaffSignup ? "Staff registration" : "Student registration"}</h2>
        <p>{mode === "login" ? "Sign in to access your CampusPulse workspace." : isStaffSignup ? "Create an authorized staff account using an invitation from your administrator." : "Create your student account using your official college email."}</p>

        {mode === "login" && (
          <div className="auth-role-picker">
            <button type="button" onClick={() => changeMode("student-signup")}>
              <span className="role-symbol">🎓</span><b>Student account</b><small>Register with your college email</small>
            </button>
            <button type="button" onClick={() => changeMode("staff-signup")}>
              <span className="role-symbol">🧑‍💼</span><b>Staff account</b><small>Invitation code required</small>
            </button>
          </div>
        )}

        {isSignup && <Field label="Full name" required><input value={name} onChange={e => setName(e.target.value)} required placeholder="Your full name" autoComplete="name" /></Field>}
        <Field label="College email address" required>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@skct.edu.in or name@skcet.ac.in" autoComplete="email" />
        </Field>
        {isStaffSignup && <>
          <Field label="Staff ID" required><input value={staffCode} onChange={e => setStaffCode(e.target.value)} required placeholder="Enter the Staff ID in your invitation" /></Field>
          <Field label="Admin-generated secret key" required><input value={invitationCode} onChange={e => setInvitationCode(e.target.value)} required placeholder="Enter the secret key from Admin" autoComplete="one-time-code" /></Field>
          <p className="staff-key-note">Enter the secret key generated by your CampusPulse administrator. Your college email, Staff ID and key must all match. Keys are single-use and expire automatically.</p>
        </>}
        <Field label="Password" required><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={isStaffSignup ? 8 : 6} placeholder={isStaffSignup ? "At least 8 characters" : "At least 6 characters"} autoComplete={isSignup ? "new-password" : "current-password"} /></Field>
        {mode === "login" && <>
          <button type="button" className="text-btn staff-activation-toggle" onClick={() => setShowActivationFields(v => !v)}>{showActivationFields ? "Hide staff activation fields" : "Have a staff invitation? Complete activation"}</button>
          {showActivationFields && <div className="staff-activation-fields"><Field label="Staff ID" required><input value={staffCode} onChange={e => setStaffCode(e.target.value)} placeholder="Staff ID from invitation" /></Field><Field label="Invitation code" required><input value={invitationCode} onChange={e => setInvitationCode(e.target.value)} placeholder="Single-use invitation code" /></Field><p className="helper">Use this after verifying your college email, including when you sign in from a different browser.</p></div>}
        </>}
        <button className="btn full auth-submit" disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : isStaffSignup ? "Create staff account" : "Create student account"}
          <ArrowRight size={16} />
        </button>

        {mode === "login" && <>
          <div className="auth-divider"><span>OR</span></div>
          <button type="button" className="btn outline full" onClick={signInWithGoogle} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 37.93 46.98 31.89 46.98 24.55z" />
              <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.5 24c0-1.6.28-3.14.79-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>
        </>}

        {mode !== "login" && <button type="button" className="text-btn" onClick={() => changeMode("login")}>Already registered? Sign in</button>}
        {mode === "login" && <button type="button" className="text-btn muted" onClick={async () => {
          if (!email) { onMessage("Enter your college email address first."); return; }
          if (!isCollegeEmail(email)) { onMessage("Use @skct.edu.in or @skcet.ac.in."); return; }
          const { error } = await supabase!.auth.resetPasswordForEmail(email.trim().toLowerCase());
          onMessage(error ? error.message : "Password reset email requested.");
        }}>Forgot password?</button>}
        <p className="auth-domain-note">Authorized college domains: <b>@skct.edu.in</b> and <b>@skcet.ac.in</b></p>
      </form>
    </div>
  );
}
function Field({label,required,optional,children}:{label:string;required?:boolean;optional?:boolean;children:any}){return <label className="field"><span>{label} <em className={required?"required":"optional"}>{required?"Required":optional?"Optional":""}</em></span>{children}</label>}
function ComplaintForm({session,onMessage,onDone,onCancel,existing}:{session:any;onMessage:(s:string)=>void;onDone:(ref:string)=>void;onCancel:()=>void;existing:Complaint[]}) {
 const [step,setStep]=useState(0),[saving,setSaving]=useState(false),[name,setName]=useState(session?.user?.user_metadata?.full_name||""),[reg,setReg]=useState(""),[department,setDepartment]=useState(""),[mobile,setMobile]=useState(""),[title,setTitle]=useState(""),[description,setDescription]=useState(""),[category,setCategory]=useState(categories[0]),[building,setBuilding]=useState(""),[floor,setFloor]=useState(""),[location,setLocation]=useState(""),[severity,setSeverity]=useState("Medium"),[affected,setAffected]=useState(""),[files,setFiles]=useState<File[]>([]),[camera,setCamera]=useState(false),[stream,setStream]=useState<MediaStream|null>(null),[video,setVideo]=useState<HTMLVideoElement|null>(null);
 const [dup,setDup]=useState<Complaint|null>(null);
 useEffect(()=>{if(camera){navigator.mediaDevices?.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false}).then(s=>{setStream(s);if(video)video.srcObject=s}).catch(()=>onMessage("Camera access unavailable. Please upload an image instead."))}return()=>stream?.getTracks().forEach(t=>t.stop())},[camera]);
 const addFiles=(list:FileList|File|null)=>{if(!list)return;const newFiles=list instanceof File?[list]:Array.from(list);const all=[...files,...newFiles];if(all.length>5){onMessage("Maximum 5 evidence images per complaint.");return}for(const f of newFiles){if(!["image/jpeg","image/png","image/webp"].includes(f.type)){onMessage(`${f.name}: JPG, PNG or WEBP only.`);return}if(f.size>5*1024*1024){onMessage(`${f.name}: file exceeds 5 MB.`);return}}setFiles(all)};
 const removeFile=(i:number)=>setFiles(files.filter((_,n)=>n!==i));
 const validate=()=>{if(!name.trim()||!title.trim()||!description.trim()||!location.trim())return "Please fill in all required fields.";if(mobile&&!/^[6-9]\d{9}$/.test(mobile))return "Enter a valid 10-digit Indian mobile number or leave it blank.";if(affected&&(!Number.isInteger(+affected)||+affected<1))return "Affected people must be a positive whole number.";return ""};
 async function submit(){if(!session?.user?.id){onMessage("Please sign in with your college account before submitting a complaint.");return;}if(!isCollegeEmail(session.user.email||"")){onMessage("Complaint submission is limited to @skct.edu.in and @skcet.ac.in accounts.");return;}const error=validate();if(error){onMessage(error);setStep(1);return}if(!supabase)return;setSaving(true);
 const scored=scorePriority(severity,affected?+affected:null,category,description);
 const duplicate=existing.find(c=>["Submitted","Under Review","Assigned","In Progress","Escalated"].includes(c.status)&&c.category===category&&(c.building||"").toLowerCase()===building.toLowerCase()&&(c.location||"").toLowerCase()===location.toLowerCase()&&similarity(title+" "+description,c.title+" "+c.description)>.42);
 if(duplicate&&!dup){setDup(duplicate);setSaving(false);setStep(3);return}
 const guestToken:string|undefined=undefined;
 const {data,error:dbError}=await supabase.rpc("submit_complaint",{p_student_id:session.user.id,p_student_name:name.trim(),p_register_number:reg.trim()||null,p_department:department||null,p_mobile_number:mobile||null,p_title:title.trim(),p_description:description.trim(),p_category:category,p_building:building.trim()||null,p_floor:floor.trim()||null,p_location:location.trim(),p_severity:severity,p_affected_people:affected?+affected:null,p_guest_token:guestToken??null,p_priority:scored.priority,p_priority_reason:scored.reason});
 if(dbError||!data){setSaving(false);onMessage(dbError?.message||"Submission failed. Your form remains available to retry.");return}
 const complaint=data as any;let uploadError="";
 for(const f of files){const path=`${complaint.id}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:upErr}=await supabase.storage.from("complaint-evidence").upload(path,f,{contentType:f.type,upsert:false});if(upErr){uploadError=upErr.message;break}const {error:attErr}=await supabase.from("complaint_attachments").insert({complaint_id:complaint.id,file_path:path,file_name:f.name,uploaded_by:session?.user?.id??null});if(attErr){uploadError=attErr.message;break}}
 setSaving(false);if(uploadError){onMessage(`Complaint ${complaint.complaint_number} saved, but evidence upload failed: ${uploadError}. Please contact administrator to attach evidence.`);onDone(complaint.complaint_number);return}
 if(guestToken){sessionStorage.setItem(`cp_guest_${complaint.complaint_number}`,guestToken);onMessage(`Guest tracking secret (save it privately): ${guestToken}. Use Track guest report to verify your complaint.`)}
 onDone(complaint.complaint_number);
 }
 const steps=["Student details","Complaint details","Problem evidence","Review & submit"];
 return <main className="form-page"><div className="form-title"><button className="back-link" onClick={onCancel}>← Back</button><div className="eyebrow">CAMPUSPULSE / NEW REPORT</div><h1>Report a campus issue</h1><p>Share the details so the right team can take action.</p></div><div className="stepper">{steps.map((s,i)=><button key={s} className={step===i?"step active":i<step?"step done":"step"} onClick={()=>i<step&&setStep(i)}><span>{i<step?"✓":i+1}</span>{s}</button>)}</div><div className="panel form-panel">
 {step===0&&<><Section title="Student details" desc="Only your name is required. Other details help the campus team follow up."><div className="form-grid"><Field label="Student name" required><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Full name"/></Field><Field label="Register number" optional><input value={reg} onChange={e=>setReg(e.target.value)} placeholder="e.g. 21EC123"/></Field><Field label="Department" optional><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">Select department</option>{depts.map(d=><option key={d}>{d}</option>)}</select></Field><Field label="Mobile number" optional><input type="tel" value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="10-digit mobile number"/></Field></div></Section></>}
 {step===1&&<><Section title="Complaint details" desc="Describe the issue and where it is happening."><div className="form-grid"><Field label="Complaint title" required><input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Classroom fan not working"/></Field><Field label="Category" required><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><div className="span-2"><Field label="Description" required><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={5} required placeholder="Explain what happened, when it started, and any relevant details…"/></Field></div><Field label="Building" optional><input value={building} onChange={e=>setBuilding(e.target.value)} placeholder="e.g. Main Block"/></Field><Field label="Floor" optional><input value={floor} onChange={e=>setFloor(e.target.value)} placeholder="e.g. 2nd floor"/></Field><Field label="Specific location" required><input value={location} onChange={e=>setLocation(e.target.value)} required placeholder="Room 204, Electronics Lab…"/></Field><Field label="People affected" optional><input type="number" min="1" value={affected} onChange={e=>setAffected(e.target.value)} placeholder="Approximate number"/></Field></div><div className="severity"><span className="label">Severity <em className="required">Required</em></span><div className="severity-options">{["Low","Medium","High","Critical"].map(s=><button type="button" key={s} className={`severity-card ${severity===s?s.toLowerCase()+" selected":""}`} onClick={()=>setSeverity(s)}><b>{s}</b><small>{{Low:"Minor inconvenience",Medium:"Operational issue",High:"Significant disruption",Critical:"Safety / urgent"}[s]}</small></button>)}</div></div></Section></>}
 {step===2&&<Section title="Upload problem evidence" desc="Capture a photo using your camera or upload an existing image to help the maintenance team understand the problem."><div className="upload-actions"><button className="btn outline" onClick={()=>setCamera(true)}><Camera size={18}/> Capture image</button><label className="btn outline upload-btn"><CloudUpload size={18}/> Upload image<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>addFiles(e.target.files)}/></label></div>{camera&&<div className="camera-box"><video ref={el=>{setVideo(el);if(el&&stream)el.srcObject=stream}} autoPlay playsInline/><div><button className="btn" onClick={()=>{if(!video)return;const c=document.createElement("canvas");c.width=video.videoWidth;c.height=video.videoHeight;c.getContext("2d")?.drawImage(video,0,0);c.toBlob(b=>{if(b)addFiles(new File([b],"camera-capture.jpg",{type:"image/jpeg"}))},"image/jpeg",.88);setCamera(false);stream?.getTracks().forEach(t=>t.stop())}}>Capture photo</button><button className="btn ghost" onClick={()=>{setCamera(false);stream?.getTracks().forEach(t=>t.stop())}}>Cancel</button></div></div>}<p className="helper">Optional · JPG, PNG, WEBP · Maximum 5 images · 5 MB each</p>{files.length>0?<div className="preview-grid">{files.map((f,i)=><div className="preview" key={`${f.name}${i}`}><img src={URL.createObjectURL(f)} alt={f.name}/><span>{f.name}</span><button onClick={()=>removeFile(i)} aria-label="Remove image"><X size={15}/></button></div>)}</div>:<div className="drop-zone"><ImageIcon size={27}/><b>No evidence added</b><span>You can submit without an image.</span></div>}</Section>}
 {step===3&&<Section title={dup?"Possible duplicate found":"Review your complaint"} desc={dup?"We found an open issue at a similar location. Review it before continuing.":"Please check the information before submitting."}>{dup&&<div className="duplicate-alert"><AlertCircle/><div><b>{dup.complaint_number} · {dup.title}</b><p>Status: {dup.status} · Location: {dup.location}</p><button className="text-btn" onClick={()=>{setDup(null);setStep(1)}}>Edit my report</button></div></div>}<div className="review-list">{[["Student",name],["Register number",reg||"Not provided"],["Department",department||"Not provided"],["Title",title],["Category",category],["Description",description],["Location",[building,floor,location].filter(Boolean).join(" · ")],["Severity",severity],["People affected",affected||"Not provided"],["Evidence",`${files.length} image(s)`]].map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div><p className="helper">Calculated priority: <strong>{scorePriority(severity,affected?+affected:null,category,description).priority}</strong> — {scorePriority(severity,affected?+affected:null,category,description).reason}</p></Section>}
 <div className="form-footer"><button className="btn ghost" onClick={onCancel}>Cancel</button><div>{step>0&&<button className="btn outline" onClick={()=>{setDup(null);setStep(step-1)}}>Back</button>}{step<3?<button className="btn" onClick={()=>{if(step===0&&!name.trim())return onMessage("Student name is required.");if(step===1){const e=validate();if(e)return onMessage(e)}setStep(step+1)}}>Continue <ArrowRight size={16}/></button>:<button className="btn" disabled={saving} onClick={submit}>{saving?"Submitting…":"Submit complaint"} <ArrowRight size={16}/></button>}</div></div>
 </div></main>
}
function Section({title,desc,children}:{title:string;desc:string;children:any}){return <section className="form-section"><div className="section-title"><h2>{title}</h2><p>{desc}</p></div>{children}</section>}

function CampusBanner({title="Welcome to CampusPulse!"}:{title?:string}){return <section className="campus-welcome"><div className="campus-welcome-copy"><span className="campus-kicker">SRI KRISHNA COLLEGE OF ENGINEERING AND TECHNOLOGY · COIMBATORE</span><h2>{title} <span>👋</span></h2><p>Report, track and resolve campus issues with your campus community.</p><a href="https://skcet.ac.in/" target="_blank" rel="noreferrer">Explore college website <ArrowRight size={15}/></a></div><div className="campus-photo-strip"><img src="https://d2lk14jtvqry1q.cloudfront.net/media/large_admin_20block2_fb0f006ca0.jpg" alt="Sri Krishna College of Engineering and Technology administrative block"/></div></section>}
function ComplaintEvidence({complaintId}:{complaintId:string}){
 const [items,setItems]=useState<Array<{id:string;name:string;url:string}>>([]);
 const [loading,setLoading]=useState(true),[message,setMessage]=useState(""),[selected,setSelected]=useState<{name:string;url:string}|null>(null);
 useEffect(()=>{let active=true;async function load(){
  if(!supabase){if(active){setMessage("Storage is unavailable.");setLoading(false)}return}
  setLoading(true);setMessage("");
  const {data,error}=await supabase.from("complaint_attachments").select("id,file_path,file_name").eq("complaint_id",complaintId).order("created_at",{ascending:true});
  if(!active)return;
  if(error){setMessage(`Unable to load evidence: ${error.message}`);setLoading(false);return}
  if(!data?.length){setMessage("No images attached");setLoading(false);return}
  const files=await Promise.all(data.map(async(row:any)=>{
   const {data:link,error:linkError}=await supabase!.storage.from("complaint-evidence").createSignedUrl(row.file_path,3600);
   return linkError||!link?.signedUrl?null:{id:row.id,name:row.file_name||"Complaint evidence",url:link.signedUrl};
  }));
  if(!active)return;
  const valid=files.filter(Boolean) as Array<{id:string;name:string;url:string}>;
  setItems(valid);
  if(!valid.length)setMessage("Images are saved, but access is blocked. Check the complaint attachment and Storage read permissions.");
  else if(valid.length<data.length)setMessage("Some images could not be opened. Check Storage read permissions.");
  setLoading(false);
 }
 void load();return()=>{active=false}},[complaintId]);
 return <div className="complaint-evidence">
  {loading?<span className="evidence-hint">Loading images…</span>:items.length?<div className="evidence-thumbs">{items.map(item=><button type="button" className="evidence-thumb" key={item.id} onClick={()=>setSelected(item)} title={`Preview ${item.name}`} aria-label={`Preview ${item.name}`}><img src={item.url} alt={item.name}/></button>)}</div>:<span className="evidence-hint">{message}</span>}
  {message&&items.length>0&&<span className="evidence-hint evidence-warning">{message}</span>}
  {selected&&<div className="evidence-preview-overlay" role="dialog" aria-modal="true" aria-label="Complaint image preview">
   <div className="evidence-preview-panel">
    <div className="evidence-preview-header"><button type="button" className="evidence-back-btn" onClick={()=>setSelected(null)}><ArrowRight size={17}/> Back to complaint</button><span>{selected.name}</span><button type="button" className="evidence-close-btn" onClick={()=>setSelected(null)} aria-label="Close image preview"><X size={20}/></button></div>
    <div className="evidence-preview-body"><img src={selected.url} alt={selected.name}/></div>
   </div>
  </div>}
 </div>
}

function Dashboard({profile,complaints,refresh,onSubmit}:{profile:Profile;complaints:Complaint[];refresh:()=>void;onSubmit:()=>void}){const counts=useMemo(()=>["Submitted","In Progress","Resolved","Escalated"].map(s=>({name:s,value:complaints.filter(c=>c.status===s).length})),[complaints]);const categoriesData=useMemo(()=>categories.map(c=>({name:c.replace(" and "," & "),count:complaints.filter(x=>x.category===c).length})).filter(x=>x.count),[complaints]);return <main className="dash"><div className="dash-heading"><div><div className="eyebrow">STUDENT WORKSPACE</div><h1>Good day, {profile.full_name.split(" ")[0]}.</h1><p>Here’s the latest on your campus reports.</p></div><button className="btn" onClick={onSubmit}><Plus size={17}/> Submit complaint</button></div><CampusBanner title={`Welcome back, ${profile.full_name.split(" ")[0]}!`}/><div className="stat-grid">{[["Total complaints",complaints.length,ClipboardList],["Pending",complaints.filter(c=>["Submitted","Under Review"].includes(c.status)).length,Activity],["In progress",complaints.filter(c=>c.status==="In Progress").length,Wrench],["Resolved",complaints.filter(c=>["Resolved","Closed"].includes(c.status)).length,CheckCircle2],["Escalated",complaints.filter(c=>c.status==="Escalated").length,AlertCircle]].map(([label,val,Icon]:any)=><div className="stat-card" key={label}><div><span>{label}</span><b>{val}</b></div><Icon size={20}/></div>)}</div><div className="dash-grid"><div className="panel"><div className="panel-head"><div><h2>My complaints</h2><p>Recent submissions and current status</p></div><button className="text-btn" onClick={refresh}>Refresh</button></div>{complaints.length===0?<Empty title="No complaints yet" text="When you report an issue, it will appear here."/>:<div className="table-wrap"><table><thead><tr><th>Reference</th><th>Issue</th><th>Priority</th><th>Status</th><th>Evidence</th><th>Submitted</th></tr></thead><tbody>{complaints.map(c=><tr key={c.id}><td className="ref">{c.complaint_number}</td><td><b>{c.title}</b><small>{c.location}</small></td><td><Pill value={c.priority}/></td><td><Pill value={c.status}/></td><td><ComplaintEvidence complaintId={c.id}/></td><td>{new Date(c.submitted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</div><div className="panel"><div className="panel-head"><div><h2>Status distribution</h2><p>Based on your complaints</p></div></div>{complaints.length?<div className="chart"><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={counts.filter(c=>c.value)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4}>{counts.map((c,i)=><Cell key={c.name} fill={["#f59e0b","#2563eb","#16a34a","#dc2626"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="legend">{counts.map((c,i)=><span key={c.name}><i style={{background:["#f59e0b","#2563eb","#16a34a","#dc2626"][i]}}/>{c.name}<b>{c.value}</b></span>)}</div></div>:<Empty title="Chart will appear here" text="Submit a complaint to see status insights."/>}</div></div><Feedback complaints={complaints} onMessage={(m)=>{}}/><ComplaintTimeline complaints={complaints}/></main>}
function Feedback({complaints,onMessage}:{complaints:Complaint[];onMessage:(s:string)=>void}){const [sent,setSent]=useState<string[]>([]),[ratings,setRatings]=useState<Record<string,number>>({}),[comments,setComments]=useState<Record<string,string>>({});useEffect(()=>{async function load(){const user=(await supabase!.auth.getUser()).data.user;if(!user)return;const {data}=await supabase!.from("feedback").select("complaint_id").eq("student_id",user.id);setSent((data||[]).map(x=>x.complaint_id))}load()},[]);const eligible=complaints.filter(c=>["Resolved","Closed"].includes(c.status)&&!sent.includes(c.id));async function submit(c:Complaint){const user=(await supabase!.auth.getUser()).data.user;if(!user)return;const rating=ratings[c.id]||0;if(rating<1||rating>5)return onMessage("Choose a rating from 1 to 5.");const {error}=await supabase!.from("feedback").insert({complaint_id:c.id,student_id:user.id,rating,comments:comments[c.id]?.trim()||null});if(error)onMessage(error.message);else{setSent(a=>[...a,c.id]);onMessage("Feedback submitted.");}}return <div className="panel feedback-panel"><div className="panel-head"><div><h2>Resolution feedback</h2><p>Rate completed issues to help improve campus service.</p></div></div>{eligible.length?eligible.map(c=><div className="feedback-row" key={c.id}><b>{c.complaint_number} · {c.title}</b><div className="feedback-controls"><select aria-label="Rating" value={ratings[c.id]||""} onChange={e=>setRatings(a=>({...a,[c.id]:Number(e.target.value)}))}><option value="">Rating (1–5)</option>{[1,2,3,4,5].map(n=><option value={n}>{n} — {["","Poor","Fair","Good","Very good","Excellent"][n]}</option>)}</select><input value={comments[c.id]||""} onChange={e=>setComments(a=>({...a,[c.id]:e.target.value}))} placeholder="Optional feedback comments"/><button className="btn" onClick={()=>submit(c)}>Send feedback</button></div></div>):<Empty title="No feedback pending" text="Feedback is available after your complaint is resolved or closed."/>}</div>}
function Admin({complaints,refresh,onMessage}:{complaints:Complaint[];refresh:()=>void;onMessage:(s:string)=>void}){const [search,setSearch]=useState(""),[filter,setFilter]=useState("All"),[assign,setAssign]=useState<Complaint|null>(null),[staff,setStaff]=useState<any[]>([]),[timelineComplaint,setTimelineComplaint]=useState<Complaint|null>(null),[timelineRows,setTimelineRows]=useState<any[]>([]),[timelineBusy,setTimelineBusy]=useState(false);useEffect(()=>{async function loadStaff(){if(!supabase)return;const {data:profiles}=await supabase.from("profiles").select("id,full_name,email,department_id").eq("role","staff");const {data:staffProfiles}=await supabase.from("staff_profiles").select("profile_id,specialization,availability,account_status");const {data:departments}=await supabase.from("departments").select("id,department_name");setStaff((profiles||[]).map(p=>({...p,department_name:departments?.find(d=>d.id===p.department_id)?.department_name||"",...(staffProfiles?.find(sp=>sp.profile_id===p.id)||{})})));}void loadStaff()},[]);const filtered=complaints.filter(c=>(filter==="All"||c.status===filter)&&`${c.complaint_number} ${c.title} ${c.location} ${c.student_name}`.toLowerCase().includes(search.toLowerCase()));async function loadTimeline(c:Complaint){setTimelineComplaint(c);setTimelineBusy(true);setTimelineRows([]);const {data,error}=await supabase!.from("complaint_history").select("id,previous_status,new_status,updated_by,remarks,created_at").eq("complaint_id",c.id).order("created_at",{ascending:true});if(error)onMessage(`Could not load complaint timeline: ${error.message}`);else setTimelineRows(data||[]);setTimelineBusy(false)}
function smartStaffFor(c:Complaint){const active=staff.filter(s=>(s.account_status||"Active").toLowerCase()==="active"&&(s.availability||"Available").toLowerCase()==="available");const candidates=active.length?active:staff.filter(s=>(s.account_status||"Active").toLowerCase()==="active");if(!candidates.length)return null;const category=c.category.toLowerCase();const keywords=category.includes("electrical")?["electrical","electric","eee"]:category.includes("internet")||category.includes("wi-fi")?["network","internet","computer","it","cse"]:category.includes("laboratory")?["lab","laboratory","ece","mechanical","instrument"]:category.includes("classroom")||category.includes("furniture")||category.includes("water")||category.includes("sanitation")?["maintenance","civil","facilities"]:[];const ranked=candidates.map(s=>{const field=`${s.department_name||""} ${s.specialization||""}`.toLowerCase();const match=keywords.length&&keywords.some(k=>field.includes(k))?1:0;const workload=complaints.filter(x=>x.assigned_staff_id===s.id&&! ["Resolved","Closed"].includes(x.status)).length;return {staff:s,match,workload}}).sort((a,b)=>b.match-a.match||a.workload-b.workload||String(a.staff.full_name).localeCompare(String(b.staff.full_name)));return ranked[0]?.staff||null}
async function smartAssign(c:Complaint){const chosen=smartStaffFor(c);if(!chosen){onMessage("No active staff member is available to assign.");return}const saved=await update(c,"Assigned",undefined,chosen.id);if(saved){setAssign(null);onMessage(`Smart assigned ${c.complaint_number} to ${chosen.full_name}.`)}}
async function update(
  c: Complaint,
  status: Status,
  priority?: string,
  staffId?: string
):Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.rpc("admin_update_complaint", {
    p_complaint_id: c.id,
    p_new_status: status,
    p_priority: priority ?? null,
    p_staff_id: staffId ?? null,
    p_update_priority: priority !== undefined,
    p_update_assignment: staffId !== undefined,
  });

  if (error) {
    onMessage(error.message);
    return false;
  }

  onMessage("Complaint updated successfully.");
  refresh();
  return true;
}
 return <main className="dash"><div className="dash-heading"><div><div className="eyebrow">ADMIN CONSOLE</div><h1>Complaint management</h1><p>Review, assign, and monitor campus issue resolution.</p></div><button className="btn outline" onClick={refresh}>Refresh data</button></div><CampusBanner title="Welcome, Administrator!"/><div className="stat-grid">{[["All complaints",complaints.length],["Pending",complaints.filter(c=>["Submitted","Under Review"].includes(c.status)).length],["In progress",complaints.filter(c=>c.status==="In Progress").length],["Resolved",complaints.filter(c=>c.status==="Resolved").length],["Escalated",complaints.filter(c=>c.status==="Escalated").length]].map(([a,b])=><div className="stat-card" key={a}><div><span>{a}</span><b>{b}</b></div><ClipboardList size={20}/></div>)}</div><div className="panel"><div className="panel-head"><div><h2>All reports</h2><p>Search and update complaint records</p></div><div className="toolbar"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search complaints…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{statuses.map(s=><option>{s}</option>)}</select></div></div><div className="table-wrap"><table><thead><tr><th>Reference</th><th>Complaint</th><th>Submitted by</th><th>Priority</th><th>Evidence</th><th>Assigned staff</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td className="ref">{c.complaint_number}</td><td><b>{c.title}</b><small>{c.category} · {c.location}</small></td><td>{c.student_name}<small>{c.register_number||"Register number not provided"}</small></td><td><Pill value={c.priority}/></td><td><ComplaintEvidence complaintId={c.id}/></td><td><button className="text-btn" onClick={()=>setAssign(c)}>{staff.find(s=>s.id===c.assigned_staff_id)?.full_name||"Assign staff"}</button></td><td><select className="status-select" value={c.status} onChange={e=>update(c,e.target.value as Status)}>{statuses.map(s=><option>{s}</option>)}</select></td><td><select className="status-select" value={c.priority} onChange={e=>update(c,c.status,e.target.value)}>{["Low","Medium","High","Critical"].map(p=><option>{p}</option>)}</select><button className="text-btn" onClick={()=>loadTimeline(c)}>Timeline</button></td></tr>)}</tbody></table></div><StaffInvitationManager onMessage={onMessage}/><StaffProfiles staff={staff.map(s=>({...s,active_count:complaints.filter(c=>c.assigned_staff_id===s.id&&!["Resolved","Closed"].includes(c.status)).length}))} onMessage={onMessage}/>{assign&&<div className="modal-back"><div className="panel modal"><button className="close" onClick={()=>setAssign(null)}><X/></button><h2>Assign maintenance staff</h2><p>{assign.complaint_number} · {assign.title} · {assign.category}</p><button className="btn full" onClick={()=>smartAssign(assign)}>✨ Smart assign (category + workload)</button><p className="helper">Or choose a staff member manually:</p><select id="staff-select"><option value="">Select staff member</option>{staff.map(s=><option value={s.id}>{s.full_name} — {s.department_name||s.specialization||s.email}</option>)}</select><button className="btn full" onClick={async()=>{const id=(document.getElementById("staff-select") as HTMLSelectElement).value;if(!id){onMessage("Select a staff member first.");return}const saved=await update(assign,"Assigned",undefined,id);if(saved)setAssign(null)}}>Save manual assignment</button></div></div>}{timelineComplaint&&<div className="modal-back"><div className="panel modal timeline-modal"><button className="close" onClick={()=>setTimelineComplaint(null)}><X/></button><h2>Complaint lifecycle</h2><p>{timelineComplaint.complaint_number} · {timelineComplaint.title}</p>{timelineBusy?<p>Loading activity…</p>:timelineRows.length?timelineRows.map((h,i)=><div className="timeline-row" key={h.id||i}><span className="timeline-dot"/><div><b>{h.previous_status||"Created"} → {h.new_status}</b><p>{h.remarks||"Status updated"}</p><small>{new Date(h.created_at).toLocaleString()}</small></div></div>):<Empty title="No history recorded" text="Status changes will appear after they are recorded in complaint_history."/>}</div></div>}</div></main>}
function Staff({complaints,refresh,onMessage}:{complaints:Complaint[];refresh:()=>void;onMessage:(s:string)=>void}){async function update(c:Complaint,status:Status){
  const {error}=await supabase!.rpc(
    "staff_update_assigned_complaint",
    {
      p_complaint_id:c.id,
      p_new_status:status
    }
  );

  if(error){
    onMessage(error.message);
    return;
  }

  onMessage("Status updated successfully.");
  refresh();
}return <main className="dash"><div className="dash-heading"><div><div className="eyebrow">MAINTENANCE WORKSPACE</div><h1>My assigned tasks</h1><p>Work through assigned campus issues and keep progress current.</p></div><button className="btn outline" onClick={refresh}>Refresh</button></div><CampusBanner title="Welcome, Staff Member!"/><div className="stat-grid">{[["Assigned",complaints.length],["In progress",complaints.filter(c=>c.status==="In Progress").length],["Resolved",complaints.filter(c=>c.status==="Resolved").length]].map(([a,b])=><div className="stat-card" key={a}><div><span>{a}</span><b>{b}</b></div><Wrench size={20}/></div>)}</div><div className="task-grid">{complaints.map(c=><article className="panel task" key={c.id}><div className="task-top"><span className="ref">{c.complaint_number}</span><Pill value={c.priority}/></div><h3>{c.title}</h3><p>{c.description}</p><div className="task-meta"><span><Activity size={14}/>{c.location}</span><span>{c.category}</span></div><ComplaintEvidence complaintId={c.id}/><InternalNotes complaint={c} onMessage={onMessage}/><div className="task-bottom"><Pill value={c.status}/><select value={c.status} onChange={e=>update(c,e.target.value as Status)}>{["Assigned","In Progress","Resolved"].map(s=><option>{s}</option>)}</select></div></article>)}</div>{!complaints.length&&<Empty title="Nothing assigned" text="New assignments will show up here."/>}</main>}

function GuestTracking({onMessage}:{onMessage:(s:string)=>void}){
 const [ref,setRef]=useState(""),[token,setToken]=useState(""),[row,setRow]=useState<any>(null),[history,setHistory]=useState<any[]>([]),[busy,setBusy]=useState(false);
 async function track(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setRow(null);setHistory([]);
 const {data,error}=await supabase.rpc("track_guest_complaint",{p_complaint_number:ref.trim().toUpperCase(),p_guest_token:token.trim()});
 if(error||!data){onMessage(error?.message||"Reference or tracking secret is invalid.");setBusy(false);return}
 setRow(data);const {data:h}=await supabase.rpc("guest_complaint_timeline",{p_complaint_number:ref.trim().toUpperCase(),p_guest_token:token.trim()});setHistory(h||[]);setBusy(false)}
 useEffect(()=>{const q=new URLSearchParams(location.search);const qref=q.get("ref");if(qref){setRef(qref);const saved=sessionStorage.getItem(`cp_guest_${qref}`);if(saved)setToken(saved)}},[]);
 return <main className="dash"><div className="dash-heading"><div><div className="eyebrow">PRIVATE GUEST ACCESS</div><h1>Track a guest complaint</h1><p>Verify with the complaint reference and private tracking secret issued at submission.</p></div></div><form className="panel auth-card" onSubmit={track}><Field label="Complaint reference" required><input required value={ref} onChange={e=>setRef(e.target.value)} placeholder="CP-2026-XXXXXXXX"/></Field><Field label="Private tracking secret" required><input required type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Tracking secret"/></Field><p className="helper">The secret is not your complaint number. Do not share it. If you lost it, contact the campus administrator for verification.</p><button className="btn full" disabled={busy}>{busy?"Verifying…":"Verify and track"}</button></form>{row&&<><div className="panel"><div className="panel-head"><div><h2>{row.complaint_number} · {row.title}</h2><p>{row.category} · {row.location}</p></div><Pill value={row.status}/></div><div className="review-list">{[["Priority",row.priority],["Submitted",new Date(row.submitted_at).toLocaleString()],["Description",row.description],["Current update",row.public_update||"No public update yet"]].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div></div><TimelineRows rows={history}/></>}</main>
}
function TimelineRows({rows}:{rows:any[]}){return <div className="panel"><div className="panel-head"><div><h2>Complaint activity</h2><p>Public status history</p></div></div>{rows.length?rows.map((h,i)=><div className="timeline-row" key={h.id||i}><span className="timeline-dot"/><div><b>{h.new_status||h.event_type}</b><p>{h.remarks||"Status updated"}</p><small>{new Date(h.created_at).toLocaleString()}</small></div></div>):<Empty title="No activity available" text="The timeline will show status updates after they are recorded."/>}</div>}
function ComplaintTimeline({complaints}:{complaints:Complaint[]}){const [selected,setSelected]=useState<string>("");const [rows,setRows]=useState<any[]>([]);async function load(id:string){setSelected(id);const {data,error}=await supabase!.from("complaint_history").select("id,previous_status,new_status,remarks,created_at").eq("complaint_id",id).order("created_at",{ascending:true});if(!error)setRows(data||[])}return <div className="panel timeline-panel"><div className="panel-head"><div><h2>Activity timeline</h2><p>View recorded status changes for your reports.</p></div><select value={selected} onChange={e=>load(e.target.value)}><option value="">Choose complaint</option>{complaints.map(c=><option key={c.id} value={c.id}>{c.complaint_number} — {c.title}</option>)}</select></div>{selected?<TimelineRows rows={rows}/>:<Empty title="Select a complaint" text="Choose a report to review its status history."/>}</div>}
function InternalNotes({complaint,onMessage}:{complaint:Complaint;onMessage:(s:string)=>void}){const [notes,setNotes]=useState<any[]>([]),[body,setBody]=useState(""),[busy,setBusy]=useState(false);async function load(){const {data,error}=await supabase!.from("complaint_notes").select("id,note,created_at,staff_id").eq("complaint_id",complaint.id).order("created_at",{ascending:false});if(!error)setNotes(data||[])}useEffect(()=>{load()},[complaint.id]);async function save(){if(!body.trim())return;setBusy(true);const user=(await supabase!.auth.getUser()).data.user;const {error}=await supabase!.from("complaint_notes").insert({complaint_id:complaint.id,staff_id:user?.id,note:body.trim()});setBusy(false);if(error)onMessage(error.message);else{setBody("");onMessage("Internal note saved.");load()}}return <div className="internal-notes"><details><summary>Internal maintenance notes ({notes.length})</summary>{notes.map(n=><div className="note-row" key={n.id}><p>{n.note}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>)}<textarea value={body} onChange={e=>setBody(e.target.value)} rows={2} placeholder="Private note for maintenance/admin team…"/><button className="btn outline" disabled={busy||!body.trim()} onClick={save}>{busy?"Saving…":"Add internal note"}</button><p className="helper">Visible only to authorized staff and administrators.</p></details></div>}
function StaffInvitationManager({onMessage}:{onMessage:(s:string)=>void}) {
  const [email,setEmail]=useState(""),[staffCode,setStaffCode]=useState(""),[departmentId,setDepartmentId]=useState(""),[designation,setDesignation]=useState(""),[expiresInHours,setExpiresInHours]=useState("24"),[departments,setDepartments]=useState<any[]>([]),[rows,setRows]=useState<any[]>([]),[busy,setBusy]=useState(false),[newCode,setNewCode]=useState("");
  async function load(){
    if(!supabase)return;
    const [{data:inviteResult,error:inviteError},{data:depts,error:deptError}]=await Promise.all([
      supabase.functions.invoke("staff-invitations",{body:{action:"list-invitations"}}),
      supabase.from("departments").select("id,department_name").order("department_name")
    ]);
    if(inviteError||inviteResult?.error)onMessage(`Could not load staff invitations: ${inviteResult?.error||inviteError?.message}`);
    else setRows(inviteResult?.invitations||[]);
    if(deptError)onMessage(`Could not load departments: ${deptError.message}`);
    setDepartments(depts||[]);
  }
  useEffect(()=>{void load()},[]);
  async function createInvitation(e:React.FormEvent){
    e.preventDefault();
    const normalized=email.trim().toLowerCase();
    if(!isCollegeEmail(normalized)){onMessage("Staff email must end in @skct.edu.in or @skcet.ac.in.");return}
    if(!staffCode.trim()){onMessage("Enter a Staff ID.");return}
    setBusy(true);setNewCode("");
    const {data,error}=await supabase!.functions.invoke("staff-invitations",{body:{action:"create-invitation",email:normalized,staffCode:staffCode.trim(),departmentId:departmentId||null,designation:designation.trim()||null,expiresInHours:Number(expiresInHours)}});
    setBusy(false);
    if(error||data?.error){onMessage(data?.error||error?.message||"Could not create invitation.");return}
    setNewCode(data.code||"");setEmail("");setStaffCode("");setDepartmentId("");setDesignation("");onMessage("Staff secret key generated and stored securely. Copy it and share it with the authorized staff member. No email was sent.");await load();
  }
  async function revoke(id:string){
    setBusy(true);const {data,error}=await supabase!.functions.invoke("staff-invitations",{body:{action:"revoke-invitation",invitationId:id}});setBusy(false);
    if(error||data?.error)onMessage(data?.error||error?.message||"Could not revoke invitation.");else{onMessage("Unused invitation revoked.");await load()}
  }
  function status(row:any){if(row.revoked_at)return "Revoked";if(row.redeemed_at)return "Used";if(new Date(row.expires_at)<new Date())return "Expired";return "Pending"}
  return <section className="panel staff-invitations">
    <div className="panel-head"><div><h2>Staff invitation management</h2><p>Generate single-use secret keys for authorized staff. Share the key directly with the staff member; no invitation email is sent.</p></div><button type="button" className="btn outline" onClick={()=>void load()}>Refresh</button></div>
    <form className="staff-invite-form" onSubmit={createInvitation}>
      <Field label="Official staff email" required><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="staff@skct.edu.in or staff@skcet.ac.in"/></Field>
      <Field label="Staff ID" required><input required value={staffCode} onChange={e=>setStaffCode(e.target.value)} placeholder="e.g. SKCT-STAFF-001"/></Field>
      <Field label="Department" optional><select value={departmentId} onChange={e=>setDepartmentId(e.target.value)}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.department_name}</option>)}</select></Field>
      <Field label="Designation / specialization" optional><input value={designation} onChange={e=>setDesignation(e.target.value)} placeholder="e.g. Assistant Professor / Maintenance"/></Field>
      <Field label="Invitation validity" required><select value={expiresInHours} onChange={e=>setExpiresInHours(e.target.value)}><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days</option></select></Field>
      <button className="btn" disabled={busy}>{busy?"Creating…":"Generate staff invitation"}<ArrowRight size={16}/></button>
    </form>
    {newCode&&<div className="staff-invite-generated"><div><b>New staff secret key</b><p>Encrypted in the database. Share it privately with the authorized staff member.</p></div><code>{newCode}</code><button type="button" className="btn outline" onClick={()=>{void navigator.clipboard?.writeText(newCode);onMessage("Invitation code copied.")}}>Copy code</button></div>}
    <div className="panel-head invite-list-head"><div><h3>Recent invitations</h3><p>Pending, used, expired and revoked staff secret keys. Existing keys are never displayed again.</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>Staff email</th><th>Staff ID</th><th>Department</th><th>Expires</th><th>Status</th><th>Secret key</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.email}</td><td>{r.staff_code}</td><td>{departments.find(d=>d.id===r.department_id)?.department_name||"—"}</td><td>{new Date(r.expires_at).toLocaleString()}</td><td><Pill value={status(r)}/></td><td>{r.display_code?<><code>{r.display_code}</code> <button type="button" className="text-btn" onClick={()=>{void navigator.clipboard?.writeText(r.display_code);onMessage("Invitation key copied.")}}>Copy</button></>:(status(r)==="Pending"?"Unavailable":"—")}</td><td>{status(r)==="Pending"?<button type="button" className="text-btn" disabled={busy} onClick={()=>void revoke(r.id)}>Revoke</button>:"—"}</td></tr>)}{!rows.length&&<tr><td colSpan={7}>No staff invitations created yet.</td></tr>}</tbody></table></div>
  </section>;
}

function StaffProfiles({staff,onMessage}:{staff:any[];onMessage:(s:string)=>void}){const [open,setOpen]=useState(false),[name,setName]=useState(""),[email,setEmail]=useState(""),[department,setDepartment]=useState(""),[phone,setPhone]=useState("");const [busy,setBusy]=useState(false);return <div className="panel staff-management"><div className="panel-head"><div><h2>Staff profiles & workload</h2><p>Staff accounts are created through Supabase Auth; here you can manage profile details and inspect active assignments.</p></div><button className="btn outline" onClick={()=>setOpen(!open)}>{open?"Close":"Edit staff profile"}</button></div>{open&&<div className="staff-edit"><Field label="Staff account" required><select value={email} onChange={e=>{setEmail(e.target.value);const s=staff.find(x=>x.email===e.target.value);setName(s?.full_name||"");setDepartment(s?.department_id||"")}}><option value="">Select staff account</option>{staff.map(s=><option key={s.id} value={s.email}>{s.full_name} — {s.email}</option>)}</select></Field><Field label="Full name" required><input value={name} onChange={e=>setName(e.target.value)} required/></Field><Field label="Department ID (UUID)" optional><input value={department||""} onChange={e=>setDepartment(e.target.value)} placeholder="Existing department UUID"/></Field><Field label="Phone" optional><input value={phone} onChange={e=>setPhone(e.target.value)}/></Field><button className="btn" disabled={busy||!email||!name.trim()} onClick={async()=>{const target=staff.find(x=>x.email===email);if(!target)return;setBusy(true);const {error}=await supabase!.from("profiles").update({full_name:name.trim(),department_id:department||null,phone:phone||null,updated_at:new Date().toISOString()}).eq("id",target.id);setBusy(false);onMessage(error?.message||"Staff profile updated.");if(!error)setOpen(false)}}>{busy?"Saving…":"Save profile"}</button></div>}<div className="table-wrap"><table><thead><tr><th>Staff member</th><th>Email</th><th>Department</th><th>Active workload</th></tr></thead><tbody>{staff.map(s=><tr key={s.id}><td>{s.full_name}</td><td>{s.email}</td><td>{s.department_id||"Not assigned"}</td><td>{s.active_count??"—"}</td></tr>)}</tbody></table></div></div>}
function Pill({value}:{value:string}){const c=value.toLowerCase().replace(/\s/g,"-");return <span className={`pill ${c}`}>{value}</span>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><div><ClipboardList size={24}/></div><b>{title}</b><p>{text}</p></div>}

function Analytics({complaints}:{complaints:Complaint[]}){
 const resolved=complaints.filter(c=>["Resolved","Closed"].includes(c.status));
 const avgHours=resolved.length?resolved.reduce((sum,c)=>sum+(c.resolved_at?Math.max(0,(new Date(c.resolved_at).getTime()-new Date(c.submitted_at).getTime())/3600000):0),0)/resolved.length:0;
 const categoryData=categories.map(category=>({category:category.replace(" and "," & "),count:complaints.filter(c=>c.category===category).length})).filter(x=>x.count>0);
 const priorityData=["Critical","High","Medium","Low"].map(priority=>({priority,count:complaints.filter(c=>c.priority===priority).length}));
 const monthData=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;return {month:d.toLocaleDateString(undefined,{month:"short"}),count:complaints.filter(c=>c.submitted_at?.startsWith(key)).length}});
 const csv=()=>{const headers=["Reference","Title","Category","Location","Student","Register Number","Priority","Status","Submitted"];const rows=complaints.map(c=>[c.complaint_number,c.title,c.category,c.location,c.student_name,c.register_number||"",c.priority,c.status,c.submitted_at]);const text=[headers,...rows].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob([text],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="campuspulse-complaints.csv";a.click();URL.revokeObjectURL(url)};
 return <main className="dash"><div className="dash-heading"><div><div className="eyebrow">REPORTING & INSIGHTS</div><h1>Campus analytics</h1><p>Metrics calculated from loaded Supabase complaint records.</p></div><button className="btn" onClick={csv}>Export CSV</button></div><div className="stat-grid">{[["Total complaints",complaints.length],["Resolution rate",`${complaints.length?Math.round(resolved.length/complaints.length*100):0}%`],["Average resolution",`${avgHours.toFixed(1)} hrs`],["Overdue",complaints.filter(c=>c.due_at&&new Date(c.due_at)<new Date()&&!["Resolved","Closed"].includes(c.status)).length]].map(([a,b])=><div className="stat-card" key={a}><div><span>{a}</span><b>{b}</b></div><BarChart3 size={20}/></div>)}</div><div className="dash-grid"><div className="panel"><div className="panel-head"><div><h2>Monthly trend</h2><p>Submitted complaints over recent months</p></div></div><div className="chart"><ResponsiveContainer width="100%" height={270}><BarChart data={monthData}><XAxis dataKey="month"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#2563eb" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></div><div className="panel"><div className="panel-head"><div><h2>Priority distribution</h2><p>Current complaint priority levels</p></div></div><div className="chart"><ResponsiveContainer width="100%" height={270}><BarChart data={priorityData}><XAxis dataKey="priority"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#06b6d4" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></div></div><div className="panel"><div className="panel-head"><div><h2>Category distribution</h2><p>Complaint volume by issue category</p></div></div><div className="chart"><ResponsiveContainer width="100%" height={280}><BarChart data={categoryData}><XAxis dataKey="category" interval={0} angle={-18} textAnchor="end" height={75}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#172554" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></div></main>
}
function Notifications({profile,onMessage}:{profile:Profile|null;onMessage:(s:string)=>void}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[filter,setFilter]=useState("All");
 async function load(){if(!supabase||!profile){setLoading(false);return}setLoading(true);const {data,error}=await supabase.from("notifications").select("*").eq("user_id",profile.id).order("created_at",{ascending:false}).limit(100);if(error)onMessage(error.message);else setRows(data||[]);setLoading(false)}
 useEffect(()=>{const client=supabase;const currentProfile=profile;if(!client||!currentProfile)return;let active=true;const loadInitial=async()=>{setLoading(true);const {data,error}=await client.from("notifications").select("*").eq("user_id",currentProfile.id).order("created_at",{ascending:false}).limit(100);if(!active)return;if(error)onMessage(error.message);else setRows(data||[]);setLoading(false)};loadInitial();const channel=client.channel(`notifications-page-${currentProfile.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${currentProfile.id}`},payload=>{const incoming=payload.new as any;setRows(current=>[incoming,...current.filter(n=>n.id!==incoming.id)].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,100))}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"notifications",filter:`user_id=eq.${currentProfile.id}`},payload=>{const incoming=payload.new as any;setRows(current=>current.map(n=>n.id===incoming.id?incoming:n))}).subscribe(status=>{if(status==="CHANNEL_ERROR")onMessage("Live notifications connection failed. Please refresh the page.")});return()=>{active=false;void client.removeChannel(channel)}},[profile?.id]);
 async function mark(id:string){if(!supabase||!profile)return;const {error}=await supabase.from("notifications").update({is_read:true}).eq("id",id).eq("user_id",profile.id);if(error)onMessage(error.message);else{setRows(r=>r.map(n=>n.id===id?{...n,is_read:true}:n));onMessage("Notification marked as read.")}}
 async function markAll(){if(!supabase||!profile)return;const {error}=await supabase.from("notifications").update({is_read:true}).eq("user_id",profile.id).eq("is_read",false);if(error)onMessage(error.message);else{setRows(r=>r.map(n=>({...n,is_read:true})));onMessage("All notifications marked as read.")}}
 const visible=rows.filter(n=>filter==="All"||(filter==="Unread"&&!n.is_read)||(filter==="Updates"&&!/assign/i.test(n.title||""))||(filter==="Assignments"&&/assign/i.test(n.title||"")));
 const unread=rows.filter(n=>!n.is_read).length;
 return <main className="dash notification-page"><div className="dash-heading"><div><div className="eyebrow">YOUR UPDATES</div><h1>Notifications <span className="unread-heading-count">{unread} unread</span></h1><p>Stay informed as your campus reports move forward.</p></div><button className="btn outline" disabled={!unread} onClick={markAll}><Check size={16}/> Mark all read</button></div><div className="panel notification-panel"><div className="notification-toolbar"><div className="notification-tabs">{["All","Unread","Updates","Assignments"].map(tab=><button key={tab} className={filter===tab?"active":""} onClick={()=>setFilter(tab)}>{tab}{tab==="All"&&<span>{rows.length}</span>}</button>)}</div><button className="text-btn" onClick={load}><Activity size={15}/> Refresh</button></div>{loading?<div className="loading">Loading notifications…</div>:visible.length?visible.map(n=><article className={`notification-card ${n.is_read?"read":"unread"}`} key={n.id}><div className={`notification-symbol ${/resolved/i.test(n.title)?"green":/assign/i.test(n.title)?"orange":"blue"}`}><Bell size={18}/></div><div className="notification-copy"><div className="notification-title-line"><b>{n.title}</b>{!n.is_read&&<span className="unread-dot"/>}</div><p>{n.message}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>{!n.is_read&&<button className="notification-read-btn" onClick={()=>mark(n.id)}>Mark read</button>}</article>):<Empty title={filter==="Unread"?"No unread notifications":"You're all caught up"} text="New complaint updates and assignments will appear here."/>}</div></main>
}

export default App;
