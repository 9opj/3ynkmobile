const translations = {
  ar: {home:'الرئيسية',control:'التحكم',screen:'الشاشة والكاميرا',lighting:'الإضاءة',files:'الملفات',monitor:'مراقبة الجهاز',apps:'التطبيقات والألعاب',network:'الشبكة',settings:'الإعدادات',connecting:'جارٍ التحقق…',connected:'الخدمة متصلة',offline:'الخدمة غير متاحة',onlineDetail:'استجابت الخدمة المحلية بنجاح.',offlineDetail:'تعذر الوصول إلى الخدمة. تحقق من تشغيلها ثم أعد الفحص.',check:'إعادة الفحص',up:'د',hours:'س',minutes:'د',seconds:'ث',language:'العربية'},
  en: {home:'Home',control:'Control',screen:'Screen & camera',lighting:'PC lighting',files:'Files',monitor:'System monitor',apps:'Apps & games',network:'Network',settings:'Settings',connecting:'Checking…',connected:'Service connected',offline:'Service unavailable',onlineDetail:'The local service responded successfully.',offlineDetail:'Could not reach the service. Check that it is running, then retry.',check:'Check again',up:'d',hours:'h',minutes:'m',seconds:'s',language:'English'}
};
let language = localStorage.getItem('pc-control-language') || 'ar';
let lastHealth = null;
const LAN_TOKEN_KEY = '3ynk-lan-token';
const isLanBrowser = !['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const apiHeaders = () => isLanBrowser && localStorage.getItem(LAN_TOKEN_KEY) ? {'Authorization':`Bearer ${localStorage.getItem(LAN_TOKEN_KEY)}`} : {};
function showPairDialog(message=''){
  if(!isLanBrowser)return;
  $('pair-feedback').textContent=message;
  $('pair-backdrop').hidden=false;
  setTimeout(()=>$('pair-code').focus(),0);
}
let applicationCatalog = null;
let commandReturnFocus = null;
const $ = id => document.getElementById(id);

function setLanguage(next) {
  const changed = language !== next;
  language = next;
  localStorage.setItem('pc-control-language', language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.motionFlow = language === 'ar' ? 'rtl' : 'ltr';
  $('language-toggle').textContent = language === 'ar' ? 'EN' : 'ع';
  $('language-toggle').setAttribute('aria-label', language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  const brandName=document.querySelector('.brand strong'),brandSub=document.querySelector('.brand small');
  if(brandName)brandName.textContent=language==='ar'?'عينك':'3ynk';
  if(brandSub)brandSub.textContent='3YNK';
  document.querySelector('footer').firstChild.textContent=language==='ar'?'عينك - 3ynk ':'3ynk ';
  document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
  document.querySelectorAll('.nav-item[data-page]').forEach(link => {
    const label = translations[language][link.dataset.page];
    link.setAttribute('aria-label', label); link.title = label;
    link.lastChild.textContent = ` ${label}`;
  });
  const optionText={
    theme:{midnight:['ليلي','Midnight'],amoled:['أسود عميق','AMOLED black'],ocean:['محيطي','Ocean'],light:['فاتح','Light'],graphite:['جرافيت','Graphite'],forest:['غابة','Forest'],sunset:['غروب','Sunset'],rose:['وردي هادئ','Soft rose'],arctic:['قطبي','Arctic'],plum:['برقوقي','Plum']},
    accent:{blue:['أزرق','Blue'],violet:['بنفسجي','Violet'],green:['أخضر','Green'],amber:['كهرماني','Amber'],rose:['وردي','Rose'],cyan:['سماوي','Cyan'],red:['أحمر','Red'],lime:['ليموني','Lime'],custom:['مخصص','Custom']},
    dock:{right:['يمين','Right'],left:['يسار','Left'],top:['أعلى','Top'],bottom:['أسفل','Bottom']},
    layout:{grid:['شبكي','Grid'],compact:['مضغوط','Compact'],wide:['عريض','Wide']},
    density:{compact:['مضغوط','Compact'],standard:['قياسي','Standard'],comfortable:['مريح','Comfortable']}
  };
  for(const [id,labels] of [['theme-select',optionText.theme],['accent-select',optionText.accent],['workspace-dock',optionText.dock],['workspace-layout',optionText.layout],['density-select',optionText.density]]){
    const select=$(id);if(select)for(const option of select.options)if(labels[option.value])option.textContent=labels[option.value][language==='ar'?0:1];
  }
  updateHealthUI();
  const active = document.querySelector('.nav-item.active');
  const page = active?.dataset.page || 'home';
  $('page-title').textContent = translations[language][page];
  refreshHeroWelcome(changed);
  if (changed) {
    const currentPage = document.querySelector('.page:not(.hidden)');
    currentPage?.classList.remove('locale-enter');
    requestAnimationFrame(() => currentPage?.classList.add('locale-enter'));
  }
}

let greetingIndex = 0;
function refreshHeroWelcome(rotate = false){
  const now=new Date(),hour=now.getHours();
  const greetings={
    ar:['كل شيء تحت عينك','مساحتك جاهزة، ابدأ من هنا','خلّ جهازك على مزاجك','أدواتك قريبة وتحكمك أسهل','خطوة واحدة وتوصل للي تبيه','عينك على التفاصيل، والباقي علينا'],
    en:['Your PC, all in view','Your workspace is ready','Make your setup yours','Everything you need, one click away','A clearer view of your PC','Stay on top of every detail']
  };
  if(rotate)greetingIndex=(greetingIndex+1)%greetings.ar.length;
  const greeting=$('hero-greeting');
  if(greeting){greeting.classList.remove('phrase-change');greeting.textContent=greetings[language][greetingIndex];requestAnimationFrame(()=>greeting.classList.add('phrase-change'));}
  const locale=language==='ar'?'ar-SA':'en-US';
  const date=new Intl.DateTimeFormat(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',calendar:'gregory'}).format(now);
  const time=new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit'}).format(now);
  $('hero-date').textContent=`${date} · ${time} · ${language==='ar'?'كل أدوات جهازك في مكان واحد':'Your PC tools in one place'}`;
}

function updateHealthUI() {
  const t = translations[language];
  const online = Boolean(lastHealth);
  $('connection').classList.toggle('offline', !online);
  $('connection').querySelector('span').textContent = online ? t.connected : (lastHealth === null ? t.connecting : t.offline);
  $('connection-title').textContent = online ? t.connected : (lastHealth === null ? t.connecting : t.offline);
  $('connection-detail').textContent = online ? t.onlineDetail : (lastHealth === null ? 'نتحقق من استجابة الخدمة المحلية.' : t.offlineDetail);
  $('service-tag').textContent = online ? t.connected : (lastHealth === null ? 'يفحص الخدمة' : t.offline);
  $('retry-health').innerHTML = `${t.check} <span>↻</span>`;
  if (online) {
    $('bind-address').textContent = `${lastHealth.lan_addresses?.[0]||'localhost'}:${lastHealth.port}`;
    const seconds = lastHealth.uptime_seconds;
    const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
    $('uptime').textContent = days ? `${days}${t.up} ${hours}${t.hours}` : hours ? `${hours}${t.hours} ${minutes}${t.minutes}` : `${minutes}${t.minutes} ${seconds % 60}${t.seconds}`;
  } else $('uptime').textContent = '—';
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health', {cache:'no-store'});
    if (!response.ok) throw new Error('health request failed');
    const body = await response.json();
    if (body.status !== 'ok') throw new Error('service unhealthy');
    lastHealth = body;
    if(body.auth_required&&!localStorage.getItem(LAN_TOKEN_KEY))showPairDialog();
  } catch { lastHealth = false; }
  updateHealthUI();
}

function showPage(page, updateHash = true) {
  if (!$(`page-${page}`)) page = 'home';
  if (page !== 'screen' && streaming) stopScreenPreview();
  if (page !== 'screen') stopCameraPreview();
  document.querySelectorAll('.nav-item[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  document.querySelectorAll('.page').forEach(section => section.classList.toggle('hidden', section.id !== `page-${page}`));
  $('page-title').textContent = translations[language][page];
  if (updateHash) history.replaceState(null, '', `#${page}`);
  if (page === 'screen') loadMonitors();
  if (page === 'lighting') { refreshSignalRGB(); refreshOpenRGB(); }
  if (page === 'files') loadFileRoots();
  if (page === 'monitor') refreshMonitor();
  if (page === 'apps') loadApps();
  if (page === 'network') refreshNetwork();
  if (page === 'home') { refreshHomeOverview(); renderHomeFavorites(); refreshHomeCapabilities(); }
}
document.querySelectorAll('.nav-item[data-page]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault(); showPage(link.dataset.page);
}));
// Make every in-app link (home cards, shortcuts, favorites, and the rail)
// navigate through the same page loader instead of only changing the hash.
window.addEventListener('hashchange', () => showPage(location.hash.slice(1), false));
// Expanding the fixed side rail reserves real content width so it cannot cover
// cards or controls. Keep it expanded while keyboard focus remains inside.
const appShell = document.querySelector('.app-shell');
const sidebar = document.querySelector('.sidebar');
let keyboardNavigation = false;
let sidebarPointerInside = false;
let sidebarHoverTimer = null;
function syncSidebarExpansion() {
  const sideDocked = ['right', 'left'].includes(appShell.dataset.dock);
  const expanded = sideDocked && (sidebarPointerInside || (keyboardNavigation && sidebar.contains(document.activeElement)));
  appShell.dataset.sidebarExpanded = String(expanded);
}
document.addEventListener('keydown', event => { if (event.key === 'Tab') { keyboardNavigation = true; syncSidebarExpansion(); } });
document.addEventListener('pointerdown', () => { keyboardNavigation = false; if (!sidebarPointerInside) syncSidebarExpansion(); });
sidebar.addEventListener('pointerenter', () => {
  sidebarPointerInside = true;
  clearTimeout(sidebarHoverTimer);
  // Let the first click land on the icon before the rail changes geometry.
  sidebarHoverTimer = setTimeout(syncSidebarExpansion, 180);
});
sidebar.addEventListener('pointerleave', () => {
  sidebarPointerInside = false;
  clearTimeout(sidebarHoverTimer);
  syncSidebarExpansion();
});
sidebar.addEventListener('focusin', () => { if (!sidebarPointerInside) syncSidebarExpansion(); });
sidebar.addEventListener('focusout', () => requestAnimationFrame(() => { if (!sidebarPointerInside) syncSidebarExpansion(); }));
window.addEventListener('blur', () => { keyboardNavigation = false; sidebarPointerInside = false; clearTimeout(sidebarHoverTimer); appShell.dataset.sidebarExpanded = 'false'; });
syncSidebarExpansion();
$('customize-workspace').addEventListener('click', () => showPage('settings'));
$('refresh-home-capabilities').addEventListener('click', refreshHomeCapabilities);
$('language-toggle').addEventListener('click', () => setLanguage(language === 'ar' ? 'en' : 'ar'));
$('retry-health').addEventListener('click', checkHealth);
setLanguage(language);
checkHealth();
setInterval(checkHealth, 5000);
$('pair-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('pair-submit');button.disabled=true;$('pair-feedback').textContent='جارٍ التحقق من الرمز…';
  try{
    const response=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('pair-code').value}),cache:'no-store'});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'pairing_failed');
    localStorage.setItem(LAN_TOKEN_KEY,result.token);$('pair-backdrop').hidden=true;$('pair-code').value='';
    await checkHealth();showPage(location.hash.slice(1)||'home',false);
  }catch(error){const messages={invalid_pairing_code:'رمز الاقتران غير صحيح.',pairing_locked_until_restart:'توقفت المحاولات لهذا الهاتف. أعد تشغيل البرنامج للحصول على رمز جديد.'};showPairDialog(messages[error.message]||`تعذر الاقتران: ${error.message}`);}
  finally{button.disabled=false;}
});

// Theme, workspace placement, density and home card preferences are stored locally.
function applyPreferences() {
  const preferences = JSON.parse(localStorage.getItem('pc-control-preferences') || '{}');
  const shell = document.querySelector('.app-shell');
  document.documentElement.dataset.theme = preferences.theme || 'midnight';
  document.documentElement.dataset.accent = preferences.accent || 'blue';
  const customAccent = /^#[0-9a-f]{6}$/i.test(preferences.customAccent || '') ? preferences.customAccent : '#83a9ff';
  document.documentElement.style.setProperty('--custom-accent', customAccent);
  if (preferences.accent === 'custom') {
    document.documentElement.style.setProperty('--accent', customAccent);
    document.documentElement.style.setProperty('--accent-strong', `color-mix(in srgb, ${customAccent} 65%, #10131b)`);
  } else {
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-strong');
  }
  document.documentElement.dataset.density = preferences.density || 'standard';
  shell.dataset.dock = preferences.dock || 'right';
  $('theme-select').value = preferences.theme || 'midnight';
  $('accent-select').value = preferences.accent || 'blue';
  $('custom-accent').value = customAccent;
  $('density-select').value = preferences.density || 'standard';
  $('workspace-dock').value = preferences.dock || 'right';
  $('workspace-layout').value = preferences.layout || 'grid';
  $('workspace-grid').dataset.layout = preferences.layout || 'grid';
  const order = preferences.widgets || ['device','connection','quick'];
  order.forEach(key => { const widget = document.querySelector(`[data-widget="${key}"]`); if (widget) $('workspace-grid').append(widget); });
  document.querySelectorAll('[data-widget-toggle]').forEach(toggle => {
    toggle.checked = preferences.visible?.[toggle.dataset.widgetToggle] !== false;
    const widget = document.querySelector(`[data-widget="${toggle.dataset.widgetToggle}"]`);
    if (widget) widget.hidden = !toggle.checked;
  });
  updateThemePreview();
}
function savePreferences() {
  const preferences = JSON.parse(localStorage.getItem('pc-control-preferences') || '{}');
  preferences.theme = $('theme-select').value;
  preferences.accent = $('accent-select').value;
  preferences.customAccent = $('custom-accent').value;
  preferences.density = $('density-select').value;
  preferences.dock = $('workspace-dock').value;
  preferences.layout = $('workspace-layout').value;
  preferences.widgets = [...document.querySelectorAll('#workspace-grid [data-widget]')].map(item => item.dataset.widget);
  preferences.visible = Object.fromEntries([...document.querySelectorAll('[data-widget-toggle]')].map(item => [item.dataset.widgetToggle, item.checked]));
  localStorage.setItem('pc-control-preferences', JSON.stringify(preferences));
  applyPreferences();
  showToast('تم حفظ تفضيلاتك على هذا المتصفح.');
}
['theme-select','accent-select','density-select','workspace-dock','workspace-layout'].forEach(id => $(id).addEventListener('change', savePreferences));
document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
$('custom-accent').addEventListener('input',()=>{if($('accent-select').value==='custom'){const value=$('custom-accent').value;if(/^#[0-9a-f]{6}$/i.test(value)){document.documentElement.style.setProperty('--accent',value);document.documentElement.style.setProperty('--accent-strong',`color-mix(in srgb, ${value} 65%, #10131b)`);updateThemePreview();}}});
$('custom-accent').addEventListener('change',savePreferences);
document.querySelectorAll('[data-widget-toggle]').forEach(toggle => toggle.addEventListener('change', savePreferences));
let draggedWidget = null;
document.querySelectorAll('#workspace-grid [data-widget]').forEach(widget => {
  widget.addEventListener('dragstart', () => { draggedWidget = widget; widget.classList.add('dragging'); });
  widget.addEventListener('dragend', () => { widget.classList.remove('dragging'); draggedWidget = null; savePreferences(); });
  widget.addEventListener('dragover', event => { event.preventDefault(); if (draggedWidget && draggedWidget !== widget) widget.before(draggedWidget); });
});
applyPreferences();

async function getJson(url) {
  const response = await fetch(url, {cache:'no-store',headers:apiHeaders()});
  const data = await response.json();
  if(response.status===401){showPairDialog('انتهت صلاحية ربط الهاتف. أدخل رمز الاقتران مجددًا.');throw new Error('pairing_required');}
  if (!response.ok) throw new Error(data.error || 'request_failed');
  return data;
}
async function postJson(url, body) {
  const response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json',...apiHeaders()}, body:JSON.stringify(body), cache:'no-store'});
  const data = await response.json();
  if(response.status===401){showPairDialog('انتهت صلاحية ربط الهاتف. أدخل رمز الاقتران مجددًا.');throw new Error('pairing_required');}
  if (!response.ok) throw new Error(data.error || 'request_failed');
  return data;
}
function updateThemePreview(){
  const theme=$('theme-select'),accent=$('accent-select');
  if(theme&&accent)$('theme-preview-label').textContent=`${theme.selectedOptions[0]?.textContent||''} · ${accent.selectedOptions[0]?.textContent||''}`;
}
function showToast(message){
  const toast=document.createElement('div');toast.className='app-toast';toast.textContent=message;$('toast-region').append(toast);
  setTimeout(()=>{toast.classList.add('toast-leave');setTimeout(()=>toast.remove(),180);},2800);
}
const commandCatalog=[
  {kind:'page',label:'الرئيسية',detail:'لوحة البداية ونبض الجهاز',icon:'⌂',page:'home'},
  {kind:'page',label:'التحكم',detail:'الماوس والكيبورد والصوت والطاقة',icon:'✣',page:'control'},
  {kind:'page',label:'الشاشة',detail:'معاينة شاشة هذا الكمبيوتر',icon:'▣',page:'screen'},
  {kind:'page',label:'إضاءة الكمبيوتر',detail:'SignalRGB والسطوع والتأثيرات',icon:'✧',page:'lighting'},
  {kind:'page',label:'الملفات',detail:'تصفح المجلدات المسموحة',icon:'▤',page:'files'},
  {kind:'page',label:'مراقبة الجهاز',detail:'المعالج والذاكرة والتخزين',icon:'◷',page:'monitor'},
  {kind:'page',label:'التطبيقات والألعاب',detail:'بحث وتشغيل ومفضلة التطبيقات',icon:'▦',page:'apps'},
  {kind:'page',label:'الشبكة',detail:'واجهات الجهاز وحالة localhost',icon:'⌁',page:'network'},
  {kind:'page',label:'الإعدادات',detail:'الثيم والتخطيط والتفضيلات',icon:'⚙',page:'settings'},
  {kind:'action',label:'فتح إدارة المهام',detail:'اختصار سريع لإدارة عمليات Windows',icon:'◷',action:'task_manager'},
  {kind:'action',label:'فحص الخدمة المحلية',detail:'تحديث حالة الاتصال',icon:'↻',action:'health'}
];
let visibleCommandItems=[];
function renderCommandResults(){
  const query=$('command-search').value.trim().toLocaleLowerCase();
  const items=commandCatalog.filter(item=>`${item.label} ${item.detail}`.toLocaleLowerCase().includes(query));
  if(query&&applicationCatalog){
    for(const app of applicationCatalog){if(app.name.toLocaleLowerCase().includes(query))items.push({kind:'app',label:app.name,detail:'تشغيل من اختصار قائمة ابدأ',icon:'▦',id:app.id});if(items.filter(item=>item.kind==='app').length>=8)break;}
  }
  visibleCommandItems=items;
  const results=$('command-results');results.replaceChildren();
  if(!items.length){const empty=document.createElement('div');empty.className='command-empty';empty.textContent=query?'ما لقيت نتيجة مطابقة. جرّب كلمة أقصر.':'ما فيه أوامر لعرضها.';results.append(empty);return;}
  for(const [index,item] of items.entries()){
    const button=document.createElement('button');button.type='button';button.className='command-item';button.setAttribute('role','option');button.dataset.commandIndex=index;
    const icon=document.createElement('span');icon.className='command-item-icon';icon.textContent=item.icon;
    const copy=document.createElement('span');copy.className='command-item-copy';const title=document.createElement('strong');title.textContent=item.label;const detail=document.createElement('small');detail.textContent=item.detail;copy.append(title,detail);button.append(icon,copy);
    if(index===0&&!query){const shortcut=document.createElement('kbd');shortcut.textContent='Enter';button.append(shortcut);}
    results.append(button);
  }
}
function closeCommandPalette(restoreFocus=true){
  $('command-backdrop').hidden=true;
  if(restoreFocus&&commandReturnFocus?.focus)commandReturnFocus.focus();
}
async function openCommandPalette(){
  commandReturnFocus=document.activeElement;$('command-backdrop').hidden=false;$('command-search').value='';renderCommandResults();$('command-search').focus();
  if(!applicationCatalog){$('command-results').setAttribute('aria-busy','true');try{const data=await getJson('/api/apps');applicationCatalog=data.applications;renderCommandResults();}catch{}finally{$('command-results').removeAttribute('aria-busy');}}
}
async function runCommand(item){
  closeCommandPalette(item.kind!=='page');
  try{
    if(item.kind==='page'){showPage(item.page);return;}
    if(item.kind==='app'){await postJson('/api/apps/launch',{id:item.id});showToast(`أُرسل طلب تشغيل ${item.label}.`);return;}
    if(item.action==='task_manager'){await postJson('/api/control',{action:'task_manager',data:{}});showToast('تم فتح إدارة المهام.');return;}
    if(item.action==='health'){await checkHealth();showToast(lastHealth?'الخدمة المحلية متصلة.':'تعذر الوصول إلى الخدمة المحلية.');}
  }catch(error){showToast(`تعذر تنفيذ ${item.label}: ${error.message}`);}
}
$('command-results').addEventListener('click',event=>{const button=event.target.closest('[data-command-index]');if(button){const item=visibleCommandItems[Number(button.dataset.commandIndex)];if(item)runCommand(item);}});
$('command-search').addEventListener('input',renderCommandResults);
$('command-search').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();$('command-results').querySelector('.command-item')?.focus();}else if(event.key==='Enter'){event.preventDefault();const item=visibleCommandItems[0];if(item)runCommand(item);}});
$('command-results').addEventListener('keydown',event=>{const buttons=[...$('command-results').querySelectorAll('.command-item')],index=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'){event.preventDefault();buttons[Math.min(index+1,buttons.length-1)]?.focus();}else if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)$('command-search').focus();else buttons[index-1]?.focus();}else if(event.key==='Enter'&&index>=0){event.preventDefault();const item=visibleCommandItems[index];if(item)runCommand(item);}});
['open-command-palette','top-command-trigger'].forEach(id=>$(id).addEventListener('click',openCommandPalette));
$('command-close').addEventListener('click',()=>closeCommandPalette());
$('command-backdrop').addEventListener('click',event=>{if(event.target===$('command-backdrop'))closeCommandPalette();});
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==='k'){event.preventDefault();if($('command-backdrop').hidden)openCommandPalette();else $('command-search').focus();}
  if(event.key==='Escape'&&!$('command-backdrop').hidden){event.preventDefault();closeCommandPalette();}
});
function uploadJson(url, body) {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST',url);xhr.setRequestHeader('Content-Type','application/json');for(const [key,value] of Object.entries(apiHeaders()))xhr.setRequestHeader(key,value);
    xhr.upload.onprogress=event=>{if(event.lengthComputable)$('files-feedback').textContent=`جارٍ الرفع… ${Math.round(event.loaded/event.total*100)}%`;};
    xhr.onload=()=>{let result={};try{result=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300)resolve(result);else reject(new Error(result.error||'upload_failed'));};
    xhr.onerror=()=>reject(new Error('network_error'));xhr.send(JSON.stringify(body));
  });
}

let selectedMonitor = 1, streaming = false, screenTimer = null;
let screenFrames = 0, screenFpsTimer = null;
async function loadMonitors() {
  try {
    const data = await getJson('/api/screens');
    const select = $('monitor-select'), previous = Number(select.value || selectedMonitor);
    select.replaceChildren();
    data.monitors.forEach(monitor => {
      const option = document.createElement('option'); option.value = monitor.index;
      option.textContent = `${monitor.name} · ${monitor.width}×${monitor.height}${monitor.primary ? ' · رئيسية' : ''}`;
      select.append(option);
    });
    if (!data.monitors.length) { $('screen-meta').textContent = 'لم يتم العثور على شاشة.'; return; }
    selectedMonitor = data.monitors.some(m => m.index === previous) ? previous : data.monitors[0].index;
    select.value = selectedMonitor;
    if (streaming) refreshScreen();
  } catch (error) { $('screen-meta').textContent = `تعذر قراءة الشاشات: ${error.message}`; }
}
let screenObjectUrl = null;
async function refreshScreen() {
  if (!streaming) return;
  try{
    const response=await fetch(`/api/screen?monitor=${selectedMonitor}&t=${Date.now()}`,{cache:'no-store',headers:apiHeaders()});
    if(response.status===401){showPairDialog('انتهت صلاحية ربط الهاتف. أدخل رمز الاقتران مجددًا.');return;}
    if(!response.ok)throw new Error('screen_capture_failed');
    const blob=await response.blob(),url=URL.createObjectURL(blob),image=$('screen-image');
    image.src=url;if(screenObjectUrl)URL.revokeObjectURL(screenObjectUrl);screenObjectUrl=url;
  }catch(error){$('screen-meta').textContent=`تعذر التقاط الشاشة: ${error.message}`;}
}
$('monitor-select').addEventListener('change', () => { selectedMonitor = Number($('monitor-select').value); refreshScreen(); });
$('stream-toggle').addEventListener('click', () => {
  streaming = !streaming;
  $('screen-placeholder').hidden = streaming;
  $('screen-image').hidden = !streaming;
  $('stream-toggle').textContent = streaming ? 'إيقاف المعاينة' : 'بدء المعاينة';
  $('screen-meta').textContent = streaming ? 'المعاينة مباشرة · localhost' : 'المعاينة متوقفة';
  if (screenTimer) clearInterval(screenTimer);
  if (screenFpsTimer) clearInterval(screenFpsTimer);
  if (streaming) { screenFrames=0; refreshScreen(); screenTimer = setInterval(refreshScreen, 700); screenFpsTimer=setInterval(()=>{if(streaming)$('screen-meta').textContent=`المعاينة مباشرة · ${screenFrames} إطار/ث تقريبًا · localhost`;screenFrames=0;},1000); }
});
function stopScreenPreview(){streaming=false;if(screenTimer)clearInterval(screenTimer);if(screenFpsTimer)clearInterval(screenFpsTimer);screenTimer=screenFpsTimer=null;$('screen-image').hidden=true;$('screen-placeholder').hidden=false;if(screenObjectUrl){URL.revokeObjectURL(screenObjectUrl);screenObjectUrl=null;}$('stream-toggle').textContent='بدء المعاينة';$('screen-meta').textContent='المعاينة متوقفة';}
$('screen-image').addEventListener('load',()=>{if(streaming)screenFrames++;});
$('screen-image').addEventListener('error', () => { $('screen-meta').textContent = 'تعذر التقاط الشاشة.'; });
$('save-screenshot').addEventListener('click', async () => {
  try { const result = await postJson('/api/screenshot', {monitor:selectedMonitor}); $('screen-meta').textContent = `حُفظت اللقطة: ${result.path}`; }
  catch (error) { $('screen-meta').textContent = `تعذر حفظ اللقطة: ${error.message}`; }
});

let cameraStream = null;
function stopCameraPreview(){
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;}
  const video=$('camera-video');if(video){video.srcObject=null;video.hidden=true;}
  const placeholder=$('camera-placeholder');if(placeholder)placeholder.hidden=false;
  const button=$('camera-toggle');if(button)button.textContent=language==='ar'?'بدء معاينة الكاميرا':'Start camera preview';
  const meta=$('camera-meta');if(meta)meta.textContent=language==='ar'?'المعاينة متوقفة · لا يتم حفظ أو إرسال الفيديو':'Preview stopped · video is not saved or sent';
}
async function refreshCameraDevices(){
  const select=$('camera-select');
  if(!navigator.mediaDevices?.enumerateDevices){select.disabled=true;$('camera-meta').textContent=language==='ar'?'المتصفح لا يتيح الوصول إلى الكاميرا.':'This browser does not provide camera access.';return;}
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
    const selected=select.value;select.replaceChildren();
    const fallback=document.createElement('option');fallback.value='';fallback.textContent=language==='ar'?'الكاميرا الافتراضية':'Default camera';select.append(fallback);
    devices.forEach((device,index)=>{const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||`${language==='ar'?'كاميرا':'Camera'} ${index+1}`;select.append(option);});
    if(devices.some(device=>device.deviceId===selected))select.value=selected;
    select.disabled=devices.length<2;
    if(!devices.length)$('camera-meta').textContent=language==='ar'?'لم تُكتشف كاميرا. وصّل كاميرا ثم حدّث المتصفح.':'No camera detected. Connect one and refresh the page.';
  }catch(error){$('camera-meta').textContent=`${language==='ar'?'تعذر اكتشاف الكاميرات':'Could not list cameras'}: ${error.message}`;}
}
async function startCameraPreview(){
  if(!navigator.mediaDevices?.getUserMedia){$('camera-meta').textContent=language==='ar'?'المتصفح لا يتيح الكاميرا على هذا الاتصال.':'Camera access is unavailable in this browser context.';return;}
  $('camera-toggle').disabled=true;$('camera-meta').textContent=language==='ar'?'بانتظار إذن الكاميرا…':'Waiting for camera permission…';
  try{
    const deviceId=$('camera-select').value;
    cameraStream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId:{exact:deviceId}}:true,audio:false});
    const video=$('camera-video');video.srcObject=cameraStream;video.hidden=false;$('camera-placeholder').hidden=true;
    $('camera-toggle').textContent=language==='ar'?'إيقاف معاينة الكاميرا':'Stop camera preview';
    $('camera-meta').textContent=language==='ar'?'معاينة محلية مباشرة · بلا تسجيل':'Live local preview · not recording';
    await refreshCameraDevices();
  }catch(error){
    const message=error.name==='NotAllowedError'?(language==='ar'?'لم يُمنح إذن الكاميرا. غيّر الإذن من إعدادات المتصفح.':'Camera permission was denied. Change it in browser settings.'):error.name==='NotFoundError'?(language==='ar'?'لم يُعثر على كاميرا متاحة.':'No available camera was found.'):`${language==='ar'?'تعذر تشغيل الكاميرا':'Could not start camera'}: ${error.message}`;
    $('camera-meta').textContent=message;stopCameraPreview();$('camera-meta').textContent=message;
  }finally{$('camera-toggle').disabled=false;}
}
function selectScreenTab(tab){
  const camera=tab==='camera';
  $('screen-tab-display').classList.toggle('active',!camera);$('screen-tab-display').setAttribute('aria-selected',String(!camera));
  $('screen-tab-camera').classList.toggle('active',camera);$('screen-tab-camera').setAttribute('aria-selected',String(camera));
  $('screen-panel-display').classList.toggle('hidden',camera);$('screen-panel-camera').classList.toggle('hidden',!camera);
  if(camera){if(streaming)stopScreenPreview();refreshCameraDevices();}
  else stopCameraPreview();
}
$('screen-tab-display').addEventListener('click',()=>selectScreenTab('display'));
$('screen-tab-camera').addEventListener('click',()=>selectScreenTab('camera'));
$('camera-select').addEventListener('change',()=>{if(cameraStream){stopCameraPreview();startCameraPreview();}});
$('camera-toggle').addEventListener('click',()=>cameraStream?stopCameraPreview():startCameraPreview());
window.addEventListener('pagehide',stopCameraPreview);

let currentFolder = null;
async function loadFileRoots() {
  try {
    const data = await getJson('/api/files/roots');
    const select = $('files-root-select'), old = currentFolder;
    select.replaceChildren();
    data.roots.forEach(root => { const option=document.createElement('option'); option.value=root.path; option.textContent=root.name; select.append(option); });
    if (!data.roots.length) { $('files-items').textContent='لا توجد مجلدات مستخدم متاحة.'; return; }
    if (!old || !data.roots.some(root => old === root.path || old.startsWith(root.path + '\\'))) currentFolder = data.roots[0].path;
    select.value = data.roots.find(root => currentFolder === root.path || currentFolder.startsWith(root.path + '\\'))?.path || data.roots[0].path;
    await renderFiles();
  } catch (error) { $('files-feedback').textContent = `تعذر فتح الملفات: ${error.message}`; }
}
async function renderFiles(path = currentFolder) {
  const data = await getJson(`/api/files/list?path=${encodeURIComponent(path)}`);
  currentFolder = data.path; $('files-path').textContent = currentFolder; $('files-root-select').value = data.roots.find(root => currentFolder === root.path || currentFolder.startsWith(root.path + '\\'))?.path || '';
  $('files-up').disabled = !data.parent;
  const list = $('files-items'); list.replaceChildren();
  data.items.forEach(item => {
    const row=document.createElement('div'); row.className='file-row';
    const name=document.createElement(item.is_dir?'button':'span'); name.className='file-name'; name.textContent=`${item.is_dir?'▰':'▤'}  ${item.name}`;
    if (item.is_dir) { name.addEventListener('click',()=>renderFiles(item.path).catch(showFileError)); row.append(name); }
    else { name.title=item.path; row.append(name); }
    const type=document.createElement('span'); type.textContent=item.is_dir?'مجلد':(item.extension||'ملف'); row.append(type);
    const size=document.createElement('span'); size.textContent=item.size==null?'—':formatBytes(item.size); row.append(size);
    const actions=document.createElement('div'); actions.className='file-actions';
    if (!item.is_dir) { const download=document.createElement('a'); download.textContent='تنزيل'; download.href=`/api/files/download?path=${encodeURIComponent(item.path)}`; actions.append(download); }
    if (!item.is_dir) for (const operation of ['copy','move']) { const transfer=document.createElement('button'); transfer.textContent=operation==='copy'?'نسخ…':'نقل…'; transfer.addEventListener('click',async()=>{const destination=prompt('أدخل مسار مجلد وجهة مسموحًا:',currentFolder);if(destination){try{await postJson(`/api/files/${operation}`,{path:item.path,destination});await renderFiles();}catch(error){showFileError(error);}}});actions.append(transfer); }
    const rename=document.createElement('button'); rename.textContent='إعادة تسمية'; rename.addEventListener('click',async()=>{const name=prompt('الاسم الجديد:',item.name);if(name&&name!==item.name){try{await postJson('/api/files/rename',{path:item.path,name});await renderFiles();}catch(error){showFileError(error);}}}); actions.append(rename);
    const remove=document.createElement('button'); remove.textContent='حذف'; remove.addEventListener('click',async()=>{if(confirm(`حذف ${item.name}؟ المجلدات غير الفارغة لا تُحذف.`)){try{await postJson('/api/files/delete',{path:item.path,confirmed:true});await renderFiles();}catch(error){showFileError(error);}}}); actions.append(remove);
    row.append(actions); list.append(row);
  });
  if (!data.items.length) list.textContent='هذا المجلد فارغ.';
  filterFileRows();
}
function showFileError(error) { $('files-feedback').textContent=`تعذر إكمال العملية: ${error.message}`; }
function formatBytes(bytes) { if(bytes<1024)return `${bytes} B`; const units=['KB','MB','GB','TB']; let value=bytes/1024,index=0;while(value>=1024&&index<units.length-1){value/=1024;index++;}return `${value.toFixed(1)} ${units[index]}`; }
$('files-root-select').addEventListener('change',()=>renderFiles($('files-root-select').value).catch(showFileError));
$('files-search').addEventListener('input',filterFileRows);
function filterFileRows(){const query=$('files-search').value.toLocaleLowerCase();[...$('files-items').children].forEach(row=>row.hidden=!row.querySelector('.file-name').textContent.toLocaleLowerCase().includes(query));}
$('files-up').addEventListener('click',async()=>{try{const data=await getJson(`/api/files/list?path=${encodeURIComponent(currentFolder)}`);if(data.parent)await renderFiles(data.parent);}catch(error){showFileError(error);}});
$('new-folder').addEventListener('click',async()=>{const name=prompt('اسم المجلد الجديد:');if(name){try{await postJson('/api/files/create-folder',{folder:currentFolder,name});await renderFiles();}catch(error){showFileError(error);}}});
$('file-upload').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file)return;
  if(file.size>16*1024*1024){showFileError(new Error('الحد الأقصى للرفع 16 MB'));event.target.value='';return;}
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  const payload={folder:currentFolder,name:file.name,data:btoa(binary)};
  try{await uploadJson('/api/files/upload',payload);$('files-feedback').textContent=`اكتمل رفع ${file.name}`;await renderFiles();}
  catch(error){if(error.message==='target_exists_or_confirmation_required'&&confirm(`الملف ${file.name} موجود. هل تريد استبداله؟`)){try{await uploadJson('/api/files/upload',{...payload,confirmed:true});await renderFiles();}catch(second){showFileError(second);}}else showFileError(error);}
  event.target.value='';
});

async function refreshMonitor() {
  try {
    const data=await getJson('/api/monitor');
    $('cpu-value').textContent=`${data.cpu_percent.toFixed(0)}%`; $('cpu-bar').style.width=`${data.cpu_percent}%`;
    $('memory-value').textContent=`${data.memory.percent.toFixed(0)}%`; $('memory-bar').style.width=`${data.memory.percent}%`;
    $('memory-detail').textContent=`${formatBytes(data.memory.used)} من ${formatBytes(data.memory.total)} · متاح ${formatBytes(data.memory.available)}`;
    $('gpu-value').textContent=data.gpu??'غير متاح'; $('system-uptime').textContent=formatDuration(data.uptime_seconds);
    $('disk-list').replaceChildren(...data.disks.map(disk=>{const card=document.createElement('article');card.className='card disk-card';card.innerHTML=`<strong></strong><span></span><div class="metric-track"><span></span></div>`;card.querySelector('strong').textContent=disk.name;card.querySelector('span').textContent=`${disk.percent}% مستخدم · ${formatBytes(disk.free)} متاح`;card.querySelector('.metric-track span').style.width=`${disk.percent}%`;return card;}));
    const processList=$('process-list');processList.replaceChildren(...data.processes.map(process=>{const row=document.createElement('div');row.className='file-row process-row';for(const value of [process.name,process.pid,formatBytes(process.memory)]){const span=document.createElement('span');span.textContent=value;row.append(span);}return row;}));
  } catch(error){ $('cpu-value').textContent=`غير متاح (${error.message})`; }
}
function formatDuration(seconds){const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);return days?`${days} يوم · ${hours} س`:`${hours} س · ${minutes} د`;}

async function refreshHomeOverview(){
  const [monitorResult,networkResult]=await Promise.allSettled([getJson('/api/monitor'),getJson('/api/network')]);
  if(monitorResult.status==='fulfilled'){
    const data=monitorResult.value,cpu=Math.round(data.cpu_percent),memory=Math.round(data.memory.percent);
    $('home-cpu').textContent=`${cpu}%`;$('home-cpu-bar').style.width=`${cpu}%`;
    $('home-memory').textContent=`${memory}%`;$('home-memory-bar').style.width=`${memory}%`;
    $('home-memory-detail').textContent=`${formatBytes(data.memory.used)} من ${formatBytes(data.memory.total)}`;
    const disk=data.disks.find(item=>item.name.toLocaleLowerCase().startsWith('c:'))||data.disks[0];
    if(disk){$('home-storage').textContent=`${disk.percent}%`;$('home-storage-detail').textContent=`${formatBytes(disk.free)} متاح على ${disk.name}`;$('home-storage-bar').style.width=`${disk.percent}%`;}
    $('uptime').textContent=formatDuration(data.uptime_seconds);
  }
  let activeAdapters=0,totalAdapters=0;
  if(networkResult.status==='fulfilled'){
    const data=networkResult.value;activeAdapters=data.adapters.filter(item=>item.is_up).length;totalAdapters=data.adapters.length;
    $('home-network').textContent=`${activeAdapters}/${totalAdapters}`;$('home-network-detail').textContent='واجهات شبكة نشطة على هذا الجهاز';
  }
  const cpu=Number.parseInt($('home-cpu').textContent,10),memory=Number.parseInt($('home-memory').textContent,10);
  if(Number.isFinite(cpu)&&cpu>=85){$('home-insight-title').textContent='المعالج تحت ضغط الآن';$('home-insight-text').textContent='افتح مراقبة الجهاز وتعرّف على أكثر العمليات استخدامًا للموارد.';$('home-insight-link').href='#monitor';}
  else if(Number.isFinite(memory)&&memory>=85){$('home-insight-title').textContent='الذاكرة قريبة من الامتلاء';$('home-insight-text').textContent='راجع استهلاك الذاكرة في صفحة المراقبة لمعرفة التطبيقات الأعلى استخدامًا.';$('home-insight-link').href='#monitor';}
  else if(networkResult.status==='fulfilled'&&activeAdapters===0){$('home-insight-title').textContent='تحقق من اتصال الشبكة';$('home-insight-text').textContent='لا تظهر واجهة نشطة الآن. افحص Wi‑Fi أو Ethernet من Windows.';$('home-insight-link').href='#network';}
  else{$('home-insight-title').textContent='كل أدواتك جاهزة';$('home-insight-text').textContent='ابدأ بمعاينة الشاشة، افتح ملفاتك، أو ثبّت تطبيقاتك المفضلة للوصول إليها أسرع.';$('home-insight-link').href='#apps';}
}

async function refreshHomeCapabilities(){
  const button=$('refresh-home-capabilities'),grid=$('home-capabilities'),started=performance.now();
  button.disabled=true;button.textContent='جارٍ اختبار الأدوات…';grid.setAttribute('aria-busy','true');
  const checks=[
    ['screen','/api/screens',data=>data.monitors.length?`${data.monitors.length} شاشة · ${data.monitors[0].width}×${data.monitors[0].height}`:'لم يعثر Windows على شاشة'],
    ['files','/api/files/roots',data=>`${data.roots.length} مجلدات متاحة للتصفح`],
    ['monitor','/api/monitor',data=>`CPU ${Math.round(data.cpu_percent)}% · RAM ${Math.round(data.memory.percent)}% · ${data.disks.length} أقراص`],
    ['apps','/api/apps',data=>`${data.applications.length} اختصارًا قابلًا للتشغيل`],
    ['network','/api/network',data=>`${data.adapters.filter(adapter=>adapter.is_up).length} واجهات نشطة · LAN محلي`],
    ['lighting','/api/rgb',data=>data.api_access?(data.current?.name||'SignalRGB جاهز'):data.pro_required?'SignalRGB متصل · واجهة التحكم تتطلب Pro':data.running?'SignalRGB يعمل لكن API غير متاحة':'SignalRGB غير متصل']
  ];
  try{
    await Promise.all(checks.map(async([key,url,describe])=>{
      const state=grid.querySelector(`[data-capability="${key}"] [data-capability-state]`),detail=grid.querySelector(`[data-capability="${key}"] [data-capability-detail]`);
      state.textContent='يفحص…';state.classList.remove('complete','failed');
      try{const data=await getJson(url);detail.textContent=describe(data);state.textContent='يعمل';state.classList.add('complete');}
      catch(error){detail.textContent=`تعذر الفحص: ${error.message}`;state.textContent='تعذر الاتصال';state.classList.add('failed');}
    }));
    const checked=new Intl.DateTimeFormat(language==='ar'?'ar-SA':'en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date());
    $('capability-checked-at').textContent=`آخر فحص: ${checked} · انتهى خلال ${Math.round(performance.now()-started)} ms. افتح أي بطاقة للدخول إلى الأداة.`;
  }finally{button.disabled=false;button.textContent='اختبر الأدوات ↻';grid.removeAttribute('aria-busy');}
}

async function renderHomeFavorites(){
  const list=$('home-favorites-list');let ids=[];
  try{ids=JSON.parse(localStorage.getItem('pc-control-favorite-apps')||'[]');if(!Array.isArray(ids))ids=[];}catch{ids=[];}
  list.replaceChildren();
  if(!ids.length){$('home-favorites-hint').textContent='ثبّت التطبيقات التي تستخدمها كثيرًا لتظهر هنا.';const link=document.createElement('a');link.className='favorite-empty';link.href='#apps';link.textContent='استكشف التطبيقات ←';list.append(link);return;}
  $('home-favorites-hint').textContent='تشغيل بنقرة واحدة · محفوظة على هذا المتصفح';
  try{
    if(!applicationCatalog){const data=await getJson('/api/apps');applicationCatalog=data.applications;}
    const favorites=ids.map(id=>applicationCatalog.find(app=>app.id===id)).filter(Boolean).slice(0,4);
    for(const app of favorites){const button=document.createElement('button');button.className='favorite-launch';button.type='button';button.title=`تشغيل ${app.name}`;const star=document.createElement('span');star.textContent='★';const name=document.createElement('strong');name.textContent=app.name;button.append(star,name);button.addEventListener('click',async()=>{button.disabled=true;try{await postJson('/api/apps/launch',{id:app.id});showToast(`أُرسل طلب تشغيل ${app.name}.`);}catch(error){showToast(`تعذر تشغيل ${app.name}: ${error.message}`);}finally{button.disabled=false;}});list.append(button);}
    if(!favorites.length){$('home-favorites-hint').textContent='التطبيقات المثبتة لم تعد في قائمة ابدأ. حدّث قائمة التطبيقات واختر غيرها.';}
    const more=document.createElement('a');more.className='favorite-empty';more.href='#apps';more.textContent='كل التطبيقات ←';list.append(more);
  }catch{$('home-favorites-hint').textContent='تعذر تحميل التطبيقات المثبتة الآن.';const link=document.createElement('a');link.className='favorite-empty';link.href='#apps';link.textContent='فتح التطبيقات ←';list.append(link);}
}

async function loadApps() {
  $('apps-list').textContent='جارٍ اكتشاف اختصارات قائمة ابدأ…';
  try {const data=await getJson('/api/apps');applicationCatalog=data.applications;renderApps(data.applications);$('apps-count').textContent=`${data.applications.length} تطبيق`;renderHomeFavorites();}
  catch(error){$('apps-list').textContent=`تعذر اكتشاف التطبيقات: ${error.message}`;}
}
function renderApps(apps){
  const list=$('apps-list');list.replaceChildren();
  if(!apps.length){list.textContent='لم يتم العثور على اختصارات تطبيقات قابلة للتشغيل.';return;}
  let savedFavorites=[];try{savedFavorites=JSON.parse(localStorage.getItem('pc-control-favorite-apps')||'[]');if(!Array.isArray(savedFavorites))savedFavorites=[];}catch{savedFavorites=[];}
  const favorites=new Set(savedFavorites);
  apps.forEach(app=>{const card=document.createElement('article');card.className='card app-card';card.dataset.appId=app.id;const title=document.createElement('strong');title.textContent=app.name;const actions=document.createElement('div');actions.className='app-card-actions';const favorite=document.createElement('button');favorite.className='favorite-button';favorite.type='button';favorite.setAttribute('aria-label',favorites.has(app.id)?`إزالة ${app.name} من المفضلة`:`إضافة ${app.name} للمفضلة`);favorite.textContent=favorites.has(app.id)?'★':'☆';favorite.classList.toggle('is-favorite',favorites.has(app.id));favorite.addEventListener('click',()=>{if(favorites.has(app.id))favorites.delete(app.id);else favorites.add(app.id);localStorage.setItem('pc-control-favorite-apps',JSON.stringify([...favorites]));favorite.classList.toggle('is-favorite',favorites.has(app.id));favorite.textContent=favorites.has(app.id)?'★':'☆';favorite.setAttribute('aria-label',favorites.has(app.id)?`إزالة ${app.name} من المفضلة`:`إضافة ${app.name} للمفضلة`);filterApps();renderHomeFavorites();showToast(favorites.has(app.id)?`أُضيف ${app.name} إلى مفضلتك.`:`أُزيل ${app.name} من المفضلة.`);});const launch=document.createElement('button');launch.className='primary-button';launch.textContent='تشغيل';launch.addEventListener('click',async()=>{launch.disabled=true;launch.textContent='جارٍ التشغيل…';$('apps-feedback').textContent='';try{await postJson('/api/apps/launch',{id:app.id});$('apps-feedback').textContent=`تم إرسال طلب تشغيل ${app.name} إلى Windows.`;}catch(error){$('apps-feedback').textContent=`تعذر تشغيل ${app.name}: ${error.message}`;}finally{launch.disabled=false;launch.textContent='تشغيل';}});actions.append(favorite,launch);card.append(title,actions);list.append(card);});
  $('apps-search').oninput=filterApps;$('apps-favorites-only').onchange=filterApps;filterApps();
  function filterApps(){const q=$('apps-search').value.toLocaleLowerCase(),onlyFavorites=$('apps-favorites-only').checked;[...list.children].forEach(card=>{const isFavorite=favorites.has(card.dataset.appId),matches=card.querySelector('strong').textContent.toLocaleLowerCase().includes(q);card.hidden=!matches||(onlyFavorites&&!isFavorite);});}
}
$('refresh-apps').addEventListener('click',loadApps);
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.go)));
$('shortcut-task-manager').addEventListener('click',async()=>{try{await postJson('/api/control',{action:'task_manager',data:{}});$('apps-feedback').textContent='تم فتح إدارة المهام.';}catch(error){$('apps-feedback').textContent=`تعذر فتح إدارة المهام: ${error.message}`;}});

async function refreshNetwork(){
  try{const [data,measured]=await Promise.all([getJson('/api/network'),(async()=>{const started=performance.now();const health=await getJson('/api/health');return {health,latency:Math.round(performance.now()-started)};})()]);const health=measured.health;
    $('network-service').textContent='متصل';$('network-address').textContent=health.lan_addresses?.length?health.lan_addresses.map(address=>`http://${address}:${health.port}`).join(' · '):`http://localhost:${health.port}`;
    $('network-latency').textContent=`زمن استجابة Health Check: ${measured.latency} ms`;
    $('network-received').textContent=formatBytes(data.bytes_received);$('network-sent').textContent=formatBytes(data.bytes_sent);
    $('network-receive-rate').textContent=`الاستقبال: ${formatBytes(data.receive_bytes_per_second)}/ث`;$('network-send-rate').textContent=`الإرسال: ${formatBytes(data.send_bytes_per_second)}/ث`;
    const active=data.adapters.filter(adapter=>adapter.is_up);$('adapter-count').textContent=`${active.length} نشط من ${data.adapters.length}`;
    $('network-advice-title').textContent=active.length?'واجهات الشبكة تعمل':'لا توجد واجهة شبكة نشطة';
    $('network-advice-text').textContent=active.length?`اتصل من هاتفك على Wi‑Fi نفسه بفتح ${health.lan_addresses?.[0]?`http://${health.lan_addresses[0]}:${health.port}`:'عنوان IPv4 للكمبيوتر'} ثم أدخل رمز الربط الظاهر في نافذة البرنامج.`:'تحقق من اتصال Wi‑Fi أو Ethernet من إعدادات Windows ثم أعد تشغيل الخدمة.';
    $('adapter-list').replaceChildren(...data.adapters.map(adapter=>{const card=document.createElement('article');card.className='card adapter-card';const title=document.createElement('strong');title.textContent=adapter.name;const detail=document.createElement('p');detail.textContent=`${adapter.ipv4} · ${adapter.is_up?'نشط':'غير نشط'}${adapter.speed_mbps?` · ${adapter.speed_mbps} Mbps`:''}`;card.append(title,detail);return card;}));
  }catch(error){$('network-service').textContent=`غير متاح: ${error.message}`;$('network-advice-title').textContent='تعذر قراءة حالة الشبكة';$('network-advice-text').textContent=`${error.message} · جرّب تحديث الحالة أو تحقق من تشغيل الخدمة المحلية.`;}
}
$('refresh-network').addEventListener('click',refreshNetwork);
$('copy-network-address').addEventListener('click',async()=>{const address=`http://${lastHealth?.lan_addresses?.[0]||'localhost'}:${lastHealth?.port||8765}`;try{await navigator.clipboard.writeText(address);$('network-feedback').textContent=`نُسخ عنوان الاتصال: ${address}`;}catch{$('network-feedback').textContent=`عنوان الاتصال: ${address}`;}});

async function refreshSignalRGB(){
  $('rgb-status-title').textContent=language==='ar'?'جارٍ الاتصال بـ SignalRGB…':'Checking SignalRGB…';
  try{
    const data=await getJson('/api/rgb');
    const ar=language==='ar';
    $('rgb-status-title').textContent=data.api_access?(ar?'SignalRGB متصل والتحكم متاح':'SignalRGB connected and controls are available'):data.pro_required?(ar?'SignalRGB يعمل · يتطلب التحكم المحلي Pro':'SignalRGB is running · local API controls require Pro'):data.running?(ar?'SignalRGB يعمل لكن واجهته المحلية غير متاحة':'SignalRGB is running, but its local API is unavailable'):(ar?'لم يُعثر على SignalRGB':'SignalRGB was not detected');
    $('rgb-status-detail').textContent=data.pro_required?(ar?'واجهة SignalRGB المحلية أعادت 403. يمكن تجربة تأثير مثبت باسمه عبر رابط SignalRGB؛ تغيير السطوع يتطلب صلاحية API.':'SignalRGB local API returned 403. You can try an installed effect by name using its app link; brightness control needs API access.'):data.api_access?(ar?'اتصال مباشر بخدمة SignalRGB المحلية على هذا الكمبيوتر.':'Connected to SignalRGB local service on this PC.'):data.running?(ar?'تحقق من تفعيل الواجهة المحلية في SignalRGB. لم نغيّر إعداداته.':'Check SignalRGB local API availability. Its settings were not changed.'): (ar?'شغّل SignalRGB ثم أعد الفحص.':'Start SignalRGB, then check again.');
    $('rgb-current-effect').textContent=data.current?.name||'—';
    $('rgb-current-enabled').textContent=data.current?`${ar?'حالة الإضاءة':'Lighting'}: ${data.current.enabled?(ar?'مفعّلة':'On'):(ar?'متوقفة':'Off')}`:`${ar?'الحالة':'Status'}: ${data.pro_required?'Pro':''}`;
    $('rgb-current-brightness').textContent=Number.isFinite(data.current?.brightness)?`${data.current.brightness}%`:'—';
    $('rgb-api-access').textContent=data.api_access?(ar?'متاح':'Available'):data.pro_required?'Pro':(ar?'غير متاح':'Unavailable');
    $('rgb-access-detail').textContent=data.pro_required?(ar?'يمكن فتح SignalRGB أو تجربة تأثير بالاسم.':'Open SignalRGB or try an effect by name.'):data.api_access?(ar?'تأثيرات وسطوع مباشر':'Direct effects and brightness'): (ar?'يتطلب تشغيل SignalRGB':'SignalRGB must be running');
    $('rgb-brightness').disabled=!data.api_access;$('rgb-brightness-apply').disabled=!data.api_access;
    $('rgb-previous').disabled=!data.api_access;$('rgb-next').disabled=!data.api_access;$('rgb-shuffle').disabled=!data.api_access;
    $('rgb-brightness').value=Number.isFinite(data.current?.brightness)?data.current.brightness:50;$('rgb-brightness-value').value=`${$('rgb-brightness').value}%`;$('rgb-brightness-value').textContent=$('rgb-brightness-value').value;
    const list=$('rgb-effect-list');list.replaceChildren();
    $('rgb-effect-count').textContent=data.effects.length?`${data.effects.length} ${ar?'تأثير':'effects'}`:(ar?'القائمة غير متاحة':'List unavailable');
    for(const effect of data.effects.slice(0,60)){
      const button=document.createElement('button');button.type='button';button.className='card rgb-effect-item';button.textContent=effect.name;
      button.addEventListener('click',()=>applyRGBEffect(effect.name,effect.id));list.append(button);
    }
    if(!data.effects.length){const note=document.createElement('div');note.className='card rgb-empty';note.textContent=data.pro_required?(ar?'SignalRGB لم يسمح بقراءة المكتبة. أدخل اسم تأثير مثبت أعلاه لتجربته.':'SignalRGB did not allow reading the library. Enter an installed effect name above to try it.'):(ar?'لا توجد تأثيرات متاحة للعرض.':'No effects are available to display.');list.append(note);}
  }catch(error){$('rgb-status-title').textContent=language==='ar'?'تعذر فحص SignalRGB':'Could not check SignalRGB';$('rgb-status-detail').textContent=error.message;}
}
async function applyRGBEffect(name,id=''){
  const effectName=(name||$('rgb-effect-name').value).trim();
  if(!effectName){$('rgb-feedback').textContent=language==='ar'?'اكتب اسم تأثير مثبت في SignalRGB أولًا.':'Enter the name of an installed SignalRGB effect first.';return;}
  $('rgb-feedback').textContent=language==='ar'?'جارٍ إرسال الطلب…':'Sending request…';
  try{
    const result=await postJson('/api/rgb/effect',id?{id,name:effectName}:{name:effectName});
    $('rgb-feedback').textContent=result.method==='application_url'?(language==='ar'?`أُرسل «${effectName}» إلى SignalRGB. تحقق من التطبيق لتأكيد النتيجة.`:`Sent “${effectName}” to SignalRGB. Check the app to confirm it applied.`):(language==='ar'?`تم تطبيق تأثير «${effectName}».`:`Applied “${effectName}”.`);
    if(result.method!=='application_url')refreshSignalRGB();
  }catch(error){$('rgb-feedback').textContent=`${language==='ar'?'تعذر تطبيق التأثير':'Could not apply effect'}: ${error.message}`;}
}
$('rgb-refresh').addEventListener('click',refreshSignalRGB);
$('openrgb-refresh').addEventListener('click',refreshOpenRGB);
async function refreshOpenRGB(){
  const ar=language==='ar';
  $('openrgb-title').textContent=ar?'جارٍ فحص OpenRGB…':'Checking OpenRGB…';
  try{
    const data=await getJson('/api/openrgb');
    const profiles=$('openrgb-profiles');profiles.replaceChildren();
    if(!data.sdk_available){
      $('openrgb-title').textContent=ar?'خادم OpenRGB SDK غير متصل':'OpenRGB SDK server is offline';
      $('openrgb-detail').textContent=ar?'شغّل OpenRGB وفعّل خادم SDK المحلي من الإعدادات. لم يُعثر على خادم على 127.0.0.1:6742.':'Start OpenRGB and enable its local SDK server in settings. No server was found at 127.0.0.1:6742.';
      return;
    }
    $('openrgb-title').textContent=ar?`OpenRGB متصل · ${data.device_count} جهاز`:`OpenRGB connected · ${data.device_count} device(s)`;
    $('openrgb-detail').textContent=ar?`SDK محلي · بروتوكول ${data.protocol} · ${data.profiles.length} ملف تعريف. تحميل ملف تعريف يرسل أمرًا لـ OpenRGB؛ لا يمكن تأكيد تطبيقه من SDK.`:`Local SDK · protocol ${data.protocol} · ${data.profiles.length} profile(s). Loading sends a request to OpenRGB; the SDK does not confirm application.`;
    if(!data.device_count){const empty=document.createElement('span');empty.className='muted';empty.textContent=ar?'لم يعلن OpenRGB عن أجهزة.':'OpenRGB reported no devices.';profiles.append(empty);}
    if(!data.profiles.length){const empty=document.createElement('span');empty.className='muted';empty.textContent=ar?'لا توجد ملفات تعريف متاحة أو أن إصدار البروتوكول لا يدعمها.':'No profiles available, or the protocol version does not support profiles.';profiles.append(empty);}
    for(const name of data.profiles){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=ar?`تحميل: ${name}`:`Load: ${name}`;button.disabled=!data.device_count;button.addEventListener('click',async()=>{button.disabled=true;$('openrgb-feedback').textContent=ar?'جارٍ إرسال الطلب…':'Sending request…';try{const result=await postJson('/api/openrgb/profile',{name});$('openrgb-feedback').textContent=ar?`أُرسل طلب تحميل «${result.profile}» إلى OpenRGB.`:`Load request sent to OpenRGB for “${result.profile}”.`;}catch(error){$('openrgb-feedback').textContent=ar?`تعذر تحميل الملف: ${error.message}`:`Could not load profile: ${error.message}`;}finally{button.disabled=false;}});profiles.append(button);}
  }catch(error){$('openrgb-title').textContent=ar?'تعذر فحص OpenRGB':'Could not check OpenRGB';$('openrgb-detail').textContent=error.message;}
}
$('rgb-brightness').addEventListener('input',()=>{$('rgb-brightness-value').value=`${$('rgb-brightness').value}%`;$('rgb-brightness-value').textContent=$('rgb-brightness-value').value;});
$('rgb-brightness-apply').addEventListener('click',async()=>{try{await postJson('/api/rgb/brightness',{value:Number($('rgb-brightness').value)});$('rgb-feedback').textContent=language==='ar'?'تم تحديث السطوع.':'Brightness updated.';refreshSignalRGB();}catch(error){$('rgb-feedback').textContent=`${language==='ar'?'تعذر تغيير السطوع':'Could not change brightness'}: ${error.message}`;}});
$('rgb-apply-effect').addEventListener('click',()=>applyRGBEffect());
$('rgb-effect-name').addEventListener('keydown',event=>{if(event.key==='Enter')applyRGBEffect();});
for(const [id,direction] of [['rgb-previous','previous'],['rgb-next','next'],['rgb-shuffle','shuffle']])$(id).addEventListener('click',async()=>{try{await postJson('/api/rgb/cycle',{direction});$('rgb-feedback').textContent=language==='ar'?'تم إرسال طلب تغيير التأثير.':'Effect change sent.';refreshSignalRGB();}catch(error){$('rgb-feedback').textContent=`${language==='ar'?'تعذر تغيير التأثير':'Could not change effect'}: ${error.message}`;}});

setInterval(()=>{if(!$('page-monitor').classList.contains('hidden'))refreshMonitor();if(!$('page-network').classList.contains('hidden'))refreshNetwork();},3000);
setInterval(()=>{if(!$('page-home').classList.contains('hidden'))refreshHomeOverview();},7000);
setInterval(()=>refreshHeroWelcome(true),26000);
const initialPage=location.hash.slice(1);showPage(initialPage || 'home',false);

let padState = null;
let pendingMotion = {dx:0,dy:0};
let motionTimer = null;
const feedback = $('action-feedback');

async function runAction(action, data = {}) {
  feedback.textContent = 'جارٍ تنفيذ الطلب…';
  feedback.classList.remove('error');
  try {
    const response = await fetch('/api/control', {
      method:'POST', headers:{'Content-Type':'application/json',...apiHeaders()},
      body:JSON.stringify({action, data}), cache:'no-store'
    });
    const result = await response.json();
    if(response.status===401)showPairDialog('انتهت صلاحية ربط الهاتف. أدخل رمز الاقتران مجددًا.');
    if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ الطلب');
    feedback.textContent = result.status === 'accepted' ? 'تم قبول الطلب.' : 'تم تنفيذ الطلب.';
  } catch (error) {
    feedback.textContent = `تعذر تنفيذ الطلب: ${error.message}`;
    feedback.classList.add('error');
  }
}

function flushMotion() {
  motionTimer = null;
  const dx = Math.trunc(pendingMotion.dx), dy = Math.trunc(pendingMotion.dy);
  pendingMotion.dx -= dx; pendingMotion.dy -= dy;
  if (dx || dy) runAction('move', {dx:Math.max(-200,Math.min(200,dx)), dy:Math.max(-200,Math.min(200,dy))});
}

const pad = $('touchpad');
pad.addEventListener('pointerdown', event => {
  pad.setPointerCapture(event.pointerId);
  padState = {id:event.pointerId, x:event.clientX, y:event.clientY, moved:0};
});
pad.addEventListener('pointermove', event => {
  if (!padState || padState.id !== event.pointerId) return;
  const dx = event.clientX - padState.x, dy = event.clientY - padState.y;
  padState.x = event.clientX; padState.y = event.clientY;
  padState.moved += Math.abs(dx) + Math.abs(dy);
  if (padState.moved > 4) {
    pendingMotion.dx += dx * 1.7; pendingMotion.dy += dy * 1.7;
    if (!motionTimer) motionTimer = setTimeout(flushMotion, 30);
  }
});
pad.addEventListener('pointerup', event => {
  if (!padState || padState.id !== event.pointerId) return;
  if (padState.moved <= 4) runAction('click', {button:'left'});
  padState = null;
});
pad.addEventListener('pointercancel', () => { padState = null; });
document.querySelectorAll('[data-click]').forEach(button => button.addEventListener('click', () => runAction('click', {button:button.dataset.click})));
document.querySelectorAll('[data-scroll]').forEach(button => button.addEventListener('click', () => runAction('scroll', {direction:button.dataset.scroll, amount:Number(button.dataset.amount)})));
document.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => runAction('key', {key:button.dataset.key})));
document.querySelectorAll('[data-shortcut]').forEach(button => button.addEventListener('click', () => runAction('shortcut', {shortcut:button.dataset.shortcut})));
document.querySelectorAll('[data-volume]').forEach(button => button.addEventListener('click', () => runAction('volume', {operation:button.dataset.volume})));
$('send-text').addEventListener('click', () => {
  const text = $('text-input').value;
  if (text) runAction('type_text', {text});
});
$('task-manager').addEventListener('click', () => runAction('task_manager'));
document.querySelectorAll('[data-power]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.power;
  const labels = {lock:'قفل الجهاز',sleep:'وضع السكون',shutdown:'إيقاف تشغيل الكمبيوتر',restart:'إعادة تشغيل الكمبيوتر'};
  if (window.confirm(`هل تريد تنفيذ «${labels[action]}» الآن؟`)) runAction('power', {operation:action, confirmed:true});
}));
