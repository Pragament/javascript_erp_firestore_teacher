// Obfuscated Firebase config
const _0x=['edutrack-admin','firebaseapp','AIzaSyAFpwi3k7Qth9MiqqRGKstY0Zkj_vrcdFY','193864081571','1:193864081571:web:7501afde01291f81e61f16','com','storage','app'];
const _cfg={k:_0x[2],d:_0x[0]+'.'+_0x[1]+'.'+_0x[5],p:_0x[0],s:_0x[0]+'.'+_0x[1]+_0x[6]+'.'+_0x[7],m:_0x[3],a:_0x[4]};
firebase.initializeApp({apiKey:_cfg.k,authDomain:_cfg.d,projectId:_cfg.p,storageBucket:_cfg.s,messagingSenderId:_cfg.m,appId:_cfg.a});

const _db=firebase.firestore(),_auth=firebase.auth();
let _user=null,_secId=null,_secName='';

const _el={auth:document.getElementById('auth-screen'),main:document.getElementById('main-app'),signin:document.getElementById('google-signin'),signout:document.getElementById('signout-btn'),email:document.getElementById('user-email'),secName:document.getElementById('section-name'),tests:document.getElementById('tests-container'),refresh:document.getElementById('refresh-tests')};

_auth.onAuthStateChanged(async u=>{if(u){_user=u;_el.auth.classList.add('d-none');_el.main.classList.remove('d-none');_el.email.textContent=u.email;await _init()}else{_user=null;_el.main.classList.add('d-none');_el.auth.classList.remove('d-none')}});

_el.signin.onclick=async()=>{try{await _auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())}catch(e){alert('Sign in failed: '+e.message)}};

_el.signout.onclick=()=>_auth.signOut();

async function _init(){await _getSec();if(_secId)await _loadTests()}

async function _getSec(){try{const snap=await _db.collection('teacherAssignments').where('teacherEmail','==',_user.email).limit(1).get();if(snap.empty){_el.secName.textContent='No section assigned';_el.tests.innerHTML='<div class="p-4 text-center text-muted">You are not assigned to any section yet. Contact your school admin.</div>';return}const d=snap.docs[0].data();_secId=d.sectionId;_secName=d.sectionName||_secId;_el.secName.textContent=_secName}catch(e){console.error('Get section:',e);_el.secName.textContent='Error loading section'}}

async function _loadTests(){try{const snap=await _db.collection('tests').where('sectionId','==',_secId).get();if(snap.empty){_el.tests.innerHTML='<div class="p-4 text-center text-muted">No tests found for your section</div>';return}let html='<div class="p-3">';for(const doc of snap.docs){const t=doc.data();const rc=await _getRC(doc.id);html+=`<div class="test-card"><div class="d-flex justify-content-between align-items-start mb-2"><h5 class="fw-bold">${t.testName||'Test'}</h5><span class="badge" style="background:#16a085;color:white">${rc} Results</span></div><p class="text-muted mb-3">${t.description||'No description'}</p><button class="btn" style="background:#16a085;color:white;border:none" onclick="_viewRes('${doc.id}','${t.testName||'Test'}')"><i class="bi bi-eye me-2"></i>View Student Results</button></div>`}html+='</div>';_el.tests.innerHTML=html}catch(e){console.error('Load tests:',e);_el.tests.innerHTML='<div class="p-4 text-center text-danger">Error loading tests</div>'}}

async function _getRC(tid){try{const snap=await _db.collection('results').where('testId','==',tid).get();return snap.size}catch(e){return 0}}

window._viewRes=async(tid,tname)=>{const modal=new bootstrap.Modal(document.getElementById('studentsModal'));const list=document.getElementById('students-list');list.innerHTML='<div class="text-center py-4"><div class="spinner-border" style="color:#16a085"></div></div>';modal.show();try{const snap=await _db.collection('results').where('testId','==',tid).get();if(snap.empty){list.innerHTML='<div class="text-center text-muted py-4">No student results yet</div>';return}const students=await _getStud();let html='';for(const doc of snap.docs){const r=doc.data();const st=students.find(s=>s.id===r.studentId);const sname=st?st.name:'Unknown';const phone=st?st.phone:'';const score=_calcScore(r);html+=`<div class="student-card"><div><h6 class="mb-1">${sname}</h6><small class="text-muted">${r.studentId}</small></div><div class="d-flex align-items-center gap-2"><span class="result-badge ${score>=70?'correct':'wrong'}">${score}%</span><a href="report.html?testId=${tid}&studentId=${r.studentId}" target="_blank" class="btn btn-sm" style="background:#2c3e50;color:white;border:none"><i class="bi bi-file-text"></i> View Report</a>${phone?`<a href="https://wa.me/${phone.replace(/\D/g,'')}?text=Hi%20${encodeURIComponent(sname)},%20your%20test%20report:%20${window.location.origin}/report.html?testId=${tid}&studentId=${r.studentId}" target="_blank" class="btn btn-sm" style="background:#25D366;color:white;border:none"><i class="bi bi-whatsapp"></i> Share</a>`:''}</div></div>`}list.innerHTML=html}catch(e){console.error('View results:',e);list.innerHTML='<div class="text-center text-danger py-4">Error loading results</div>'}};

async function _getStud(){try{const snap=await _db.collection('students').where('sectionId','==',_secId).get();return snap.docs.map(d=>({id:d.id,...d.data()}))}catch(e){return[]}}

function _calcScore(r){let correct=0,total=0;for(let k in r){if(k.startsWith('Q')){total++;if(r[k]==='R')correct++}}return total>0?Math.round(correct/total*100):0}

_el.refresh.onclick=()=>_loadTests();
