/* =========================================================
   Cartão Diário — lógica principal
   Dados salvos localmente no aparelho (localStorage).
   ========================================================= */

const STORAGE_KEY = 'dbt_diario_v1';

// Emoções: lista fixa, NUNCA editável pelo usuário.
const EMOCOES_FIXAS = [
  'Tristeza', 'Raiva', 'Felicidade', 'Ciúmes', 'Amor',
  'Nojo', 'Inveja', 'Medo', 'Vergonha', 'Culpa'
];

const DEFAULT_DESCONFORTOS = [
  'Procrastinação', 'Hiperfoco', 'Multitarefas',
  'Pensamentos simultâneos/acelerados', 'Pensamentos ruminativos',
  'Dificuldade para acordar', 'Sono durante o dia', 'Dificuldade pra dormir',
  'Interações sociais',
  'Tarefas cotidianas (fazer compras, guardar roupas, marcar compromissos)',
  'Estudar ou trabalhar (freelas)', 'Tomar decisões'
];

const DEFAULT_IMPULSOS = [
  'Faltar a academia para dormir mais', 'Usar o celular em excesso',
  'Maratonar vídeos no Youtube', 'Procrastinar (adiar/não trabalhar ou estudar de noite)',
  'Seguir um hiperfoco', 'Multitarefas',
  'Mudar meus planos porque apareceu algo no meio do caminho',
  'Gastar além do planejado'
];

const DEFAULT_MEDICACOES = ['Lamotrigina', 'Vortioxetina', 'Outros'];

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

/* ---------------- State ---------------- */

let state = loadState();
let currentDate = new Date(); // date currently shown on main screen
let calendarViewDate = new Date();
let editingListKey = null;

function defaultState(){
  return {
    config: {
      lists: {
        desconfortos: DEFAULT_DESCONFORTOS.slice(),
        impulsos: DEFAULT_IMPULSOS.slice(),
        medicacoes: DEFAULT_MEDICACOES.slice()
      }
    },
    entries: {}
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if(!parsed.config || !parsed.entries) return defaultState();
    return parsed;
  }catch(e){
    console.error('Erro ao carregar dados', e);
    return defaultState();
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.error('Erro ao salvar dados', e);
    showToast('Não foi possível salvar. Espaço de armazenamento cheio?');
  }
}

/* ---------------- Date helpers ---------------- */

function toISO(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fromISO(s){
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function addDays(d, n){
  const nd = new Date(d);
  nd.setDate(nd.getDate()+n);
  return nd;
}
function isSameDay(a,b){ return toISO(a) === toISO(b); }
function isToday(d){ return isSameDay(d, new Date()); }

/* Monday-start weekday index: 0=Seg .. 6=Dom */
function mondayIndex(d){
  const js = d.getDay(); // 0=Dom..6=Sab
  return (js + 6) % 7;
}
function startOfWeek(d){
  return addDays(d, -mondayIndex(d));
}

/* ---------------- Entry access ---------------- */

function getEntry(dateISO, createIfMissing){
  if(!state.entries[dateISO]){
    if(!createIfMissing) return null;
    state.entries[dateISO] = {
      emocoes: {},
      desconfortos: {},
      impulsos: {},
      medicacoes: {},
      medOutroTexto: '',
      diario: ''
    };
  }
  return state.entries[dateISO];
}

function ensureItemData(container, key, withAcao){
  if(!container[key]){
    container[key] = { nota: null, obs: '' };
    if(withAcao) container[key].virouAcao = false;
  }
  return container[key];
}

/* ---------------- Fill status ---------------- */
// "completo" = todas as Emoções + Desconfortos + Impulsos têm nota atribuída.
// "parcial" = algo preenchido, mas não tudo.
// "vazio" = nada preenchido.
function computeFillStatus(dateISO){
  const entry = state.entries[dateISO];
  if(!entry) return 'empty';

  const requiredKeys = [
    ...EMOCOES_FIXAS.map(n => ['emocoes', n]),
    ...state.config.lists.desconfortos.map(n => ['desconfortos', n]),
    ...state.config.lists.impulsos.map(n => ['impulsos', n]),
  ];

  let anyFilled = false;
  let allFilled = true;

  for(const [cat, name] of requiredKeys){
    const val = entry[cat] && entry[cat][name] ? entry[cat][name].nota : null;
    if(val !== null && val !== undefined) anyFilled = true;
    else allFilled = false;
  }
  // observações / diário / medicações também contam como "algo preenchido"
  if(entry.diario && entry.diario.trim()) anyFilled = true;
  if(entry.medicacoes && Object.values(entry.medicacoes).some(v => v)) anyFilled = true;

  if(!anyFilled) return 'empty';
  if(allFilled) return 'complete';
  return 'partial';
}

/* ---------------- Rendering: main screen ---------------- */

function renderDayHeader(){
  // Atualiza todas as instâncias do componente de navegação de dia
  // (tela principal e tela do diário livre) para manterem-se em sincronia.
  document.querySelectorAll('.js-day-nav .day-name').forEach(el => {
    el.textContent = WEEKDAY_NAMES[currentDate.getDay()];
  });
  document.querySelectorAll('.js-day-nav .day-date').forEach(el => {
    el.textContent = `${currentDate.getDate()} de ${MONTH_NAMES[currentDate.getMonth()]}`;
  });

  const status = computeFillStatus(toISO(currentDate));
  const indicator = document.getElementById('fill-indicator');
  indicator.className = 'fill-indicator' + (status === 'partial' ? ' state-partial' : status === 'complete' ? ' state-complete' : '');
}

function renderAll(){
  renderDayHeader();
  renderSection('emocoes', EMOCOES_FIXAS, 'list-emocoes', {fixed:true});
  renderSection('desconfortos', state.config.lists.desconfortos, 'list-desconfortos', {});
  renderSection('impulsos', state.config.lists.impulsos, 'list-impulsos', {withAcao:true});
  renderMedicacoes();
  refreshDiarioIfActive();
}

function refreshDiarioIfActive(){
  if(!viewDiario.classList.contains('view-active')) return;
  const dateISO = toISO(currentDate);
  const entry = getEntry(dateISO, false);
  const textarea = document.getElementById('diario-text');
  // só substitui o valor se o campo não estiver com foco, para não atrapalhar
  // o usuário caso ele esteja digitando no momento da atualização.
  if(document.activeElement !== textarea){
    textarea.value = entry ? (entry.diario || '') : '';
  }
}

function renderSection(catKey, itemNames, containerId, opts){
  const container = document.getElementById(containerId);
  const dateISO = toISO(currentDate);
  const entry = getEntry(dateISO, false);
  const openState = collectOpenState(container);

  container.innerHTML = '';
  itemNames.forEach(name => {
    const data = entry && entry[catKey] && entry[catKey][name];
    const filled = data && data.nota !== null && data.nota !== undefined;

    const row = document.createElement('div');
    row.className = 'item-row' + (filled ? ' filled' : '');
    row.dataset.name = name;
    if(openState.has(name)) row.classList.add('open');

    const toggle = document.createElement('button');
    toggle.className = 'item-toggle';
    toggle.innerHTML = `<span class="item-name">${escapeHtml(name)}</span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;
    toggle.addEventListener('click', () => {
      const wasOpen = row.classList.contains('open');
      // Apenas um item pode ficar aberto por vez dentro da mesma seção.
      container.querySelectorAll('.item-row.open').forEach(r => r.classList.remove('open'));
      if(!wasOpen) row.classList.add('open');
    });

    const detail = document.createElement('div');
    detail.className = 'item-detail';
    const inner = document.createElement('div');
    inner.className = 'item-detail-inner';

    const dotsRow = document.createElement('div');
    dotsRow.className = 'dots-row';
    const currentVal = data ? data.nota : null;
    for(let v=0; v<=5; v++){
      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.dataset.val = v;
      dot.setAttribute('aria-label', `Nota ${v}`);
      if(currentVal !== null && currentVal !== undefined){
        if(v <= currentVal && v > 0) dot.classList.add('is-lit');
        if(v === currentVal) dot.classList.add('is-selected');
        if(v <= currentVal) dot.classList.add('is-selected');
      }
      dot.addEventListener('click', () => {
        const d = getEntry(dateISO, true);
        const item = ensureItemData(d[catKey], name, !!opts.withAcao);
        item.nota = v;
        saveState();
        renderSection(catKey, itemNames, containerId, opts);
        renderDayHeader();
      });
      dotsRow.appendChild(dot);
    }

    const ratingLabel = document.createElement('div');
    ratingLabel.className = 'rating-value';
    ratingLabel.innerHTML = (currentVal !== null && currentVal !== undefined)
      ? `Nota: <b>${currentVal}</b>` : 'Toque em uma bolinha para atribuir a nota';

    inner.appendChild(dotsRow);
    inner.appendChild(ratingLabel);

    if(opts.withAcao){
      const label = document.createElement('label');
      label.className = 'impulse-checkbox';
      const checked = data && data.virouAcao ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" ${checked}> Impulso se tornou ação?`;
      label.querySelector('input').addEventListener('change', (e) => {
        const d = getEntry(dateISO, true);
        const item = ensureItemData(d[catKey], name, true);
        item.virouAcao = e.target.checked;
        saveState();
      });
      inner.appendChild(label);
    }

    const obs = document.createElement('textarea');
    obs.className = 'obs-input';
    obs.placeholder = 'Observações (opcional)';
    obs.value = data ? (data.obs || '') : '';
    obs.addEventListener('input', debounce((e) => {
      const d = getEntry(dateISO, true);
      const item = ensureItemData(d[catKey], name, !!opts.withAcao);
      item.obs = e.target.value;
      saveState();
      // Não re-renderiza a seção aqui: reconstruir o DOM enquanto o usuário
      // digita tira o foco do campo e fecha o teclado no celular.
    }, 400));
    inner.appendChild(obs);

    detail.appendChild(inner);
    row.appendChild(toggle);
    row.appendChild(detail);
    container.appendChild(row);
  });
}

function collectOpenState(container){
  const open = new Set();
  container.querySelectorAll('.item-row.open').forEach(r => open.add(r.dataset.name));
  return open;
}

function renderMedicacoes(){
  const container = document.getElementById('list-medicacoes');
  const dateISO = toISO(currentDate);
  const entry = getEntry(dateISO, false);
  container.innerHTML = '';

  state.config.lists.medicacoes.forEach(name => {
    const isOutros = name === 'Outros';
    const on = entry && entry.medicacoes && !!entry.medicacoes[name];

    const row = document.createElement('div');
    row.className = 'med-row';
    row.style.flexWrap = 'wrap';

    const line = document.createElement('div');
    line.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;';
    line.innerHTML = `<span class="med-name">${escapeHtml(name)}</span>`;
    const sw = document.createElement('button');
    sw.className = 'med-toggle-switch' + (on ? ' on' : '');
    sw.setAttribute('aria-label', `${name} tomada hoje`);
    sw.addEventListener('click', () => {
      const d = getEntry(dateISO, true);
      d.medicacoes[name] = !d.medicacoes[name];
      saveState();
      renderMedicacoes();
      renderDayHeader();
    });
    line.appendChild(sw);
    row.appendChild(line);

    if(isOutros && on){
      const input = document.createElement('input');
      input.className = 'med-other-input';
      input.placeholder = 'Nome da medicação';
      input.value = entry && entry.medOutroTexto ? entry.medOutroTexto : '';
      input.addEventListener('input', debounce((e) => {
        const d = getEntry(dateISO, true);
        d.medOutroTexto = e.target.value;
        saveState();
      }, 400));
      row.appendChild(input);
    }
    container.appendChild(row);
  });
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- Day navigation ---------------- */

function goToDay(d){
  currentDate = new Date(d);
  renderAll();
}

// Delegação de eventos: funciona para todas as instâncias do componente de
// navegação de dia (tela principal e tela do diário livre).
document.addEventListener('click', (e) => {
  if(e.target.closest('.js-prev-day')) goToDay(addDays(currentDate,-1));
  if(e.target.closest('.js-next-day')) goToDay(addDays(currentDate,1));
});

// swipe sobre qualquer instância do componente de navegação
(function setupSwipe(){
  let startX = null, startY = null, activeNav = null;
  document.addEventListener('touchstart', (e) => {
    const nav = e.target.closest('.js-day-nav');
    if(!nav) { activeNav = null; return; }
    activeNav = nav;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
  }, {passive:true});
  document.addEventListener('touchend', (e) => {
    if(startX === null || !activeNav) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)*1.5){
      goToDay(addDays(currentDate, dx < 0 ? 1 : -1));
    }
    startX = null; startY = null; activeNav = null;
  }, {passive:true});
})();

/* ---------------- Calendar modal ---------------- */

const modalCalendar = document.getElementById('modal-calendar');
document.addEventListener('click', (e) => {
  if(!e.target.closest('.js-open-calendar')) return;
  calendarViewDate = new Date(currentDate);
  renderCalendar();
  modalCalendar.classList.add('open');
});
document.getElementById('cal-close').addEventListener('click', () => modalCalendar.classList.remove('open'));
modalCalendar.addEventListener('click', (e) => { if(e.target === modalCalendar) modalCalendar.classList.remove('open'); });

document.getElementById('cal-prev-month').addEventListener('click', () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth()-1, 1);
  renderCalendar();
});
document.getElementById('cal-next-month').addEventListener('click', () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth()+1, 1);
  renderCalendar();
});

function renderCalendar(){
  const y = calendarViewDate.getFullYear();
  const m = calendarViewDate.getMonth();
  document.getElementById('cal-month-label').textContent = `${MONTH_NAMES[m]} de ${y}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstOfMonth = new Date(y, m, 1);
  const leadingBlanks = mondayIndex(firstOfMonth);
  const daysInMonth = new Date(y, m+1, 0).getDate();

  for(let i=0;i<leadingBlanks;i++){
    const b = document.createElement('div');
    b.className = 'cal-day empty';
    grid.appendChild(b);
  }
  for(let day=1; day<=daysInMonth; day++){
    const d = new Date(y, m, day);
    const iso = toISO(d);
    const status = computeFillStatus(iso);
    const cell = document.createElement('button');
    cell.className = 'cal-day';
    if(isToday(d)) cell.classList.add('today');
    if(isSameDay(d, currentDate)) cell.classList.add('selected');
    if(status === 'partial') cell.classList.add('partial');
    if(status === 'complete') cell.classList.add('complete');
    cell.innerHTML = `${day}` + (status !== 'empty' ? '<span class="cal-dot"></span>' : '');
    cell.addEventListener('click', () => {
      goToDay(d);
      modalCalendar.classList.remove('open');
    });
    grid.appendChild(cell);
  }
}

/* ---------------- Edit list modal (desconfortos / impulsos / medicações) ---------------- */

const modalEditList = document.getElementById('modal-edit-list');
document.querySelectorAll('.edit-list-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    editingListKey = btn.dataset.list;
    openEditListModal();
  });
});
document.getElementById('edit-list-close').addEventListener('click', closeEditListModal);
modalEditList.addEventListener('click', (e) => { if(e.target === modalEditList) closeEditListModal(); });

function closeEditListModal(){
  modalEditList.classList.remove('open');
  editingListKey = null;
  renderAll();
}

const LIST_TITLES = { desconfortos:'Editar desconfortos', impulsos:'Editar impulsos', medicacoes:'Editar medicações' };

function openEditListModal(){
  document.getElementById('edit-list-title').textContent = LIST_TITLES[editingListKey];
  document.getElementById('edit-list-input').value = '';
  renderEditListItems();
  modalEditList.classList.add('open');
}

function renderEditListItems(){
  const wrap = document.getElementById('edit-list-items');
  wrap.innerHTML = '';
  const items = state.config.lists[editingListKey];
  items.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'edit-item-row';

    const reorder = document.createElement('div');
    reorder.className = 'reorder-btns';
    reorder.innerHTML = `
      <button data-dir="up" aria-label="Mover para cima"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg></button>
      <button data-dir="down" aria-label="Mover para baixo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>`;
    reorder.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const dir = b.dataset.dir === 'up' ? -1 : 1;
        const newIdx = idx + dir;
        if(newIdx < 0 || newIdx >= items.length) return;
        [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
        saveState();
        renderEditListItems();
      });
    });

    const input = document.createElement('input');
    input.className = 'item-name-input';
    input.value = name;
    input.addEventListener('change', (e) => {
      const newName = e.target.value.trim();
      if(!newName) { e.target.value = name; return; }
      renameListItem(editingListKey, name, newName);
      items[idx] = newName;
      saveState();
    });

    const remove = document.createElement('button');
    remove.className = 'remove-item-btn';
    remove.setAttribute('aria-label', 'Remover item');
    remove.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0 1 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-13"/></svg>`;
    remove.addEventListener('click', () => {
      if(items.length <= 1){ showToast('É preciso manter ao menos um item na lista.'); return; }
      items.splice(idx,1);
      saveState();
      renderEditListItems();
    });

    row.appendChild(reorder);
    row.appendChild(input);
    row.appendChild(remove);
    wrap.appendChild(row);
  });
}

function renameListItem(listKey, oldName, newName){
  if(oldName === newName) return;
  const catMap = { desconfortos:'desconfortos', impulsos:'impulsos', medicacoes:'medicacoes' };
  const cat = catMap[listKey];
  Object.values(state.entries).forEach(entry => {
    if(entry[cat] && entry[cat][oldName]){
      entry[cat][newName] = entry[cat][oldName];
      delete entry[cat][oldName];
    }
  });
}

document.getElementById('edit-list-add-btn').addEventListener('click', addListItem);
document.getElementById('edit-list-input').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') addListItem();
});
function addListItem(){
  const input = document.getElementById('edit-list-input');
  const val = input.value.trim();
  if(!val) return;
  state.config.lists[editingListKey].push(val);
  saveState();
  input.value = '';
  renderEditListItems();
}

/* ---------------- Diário livre ---------------- */

const viewMain = document.getElementById('view-main');
const viewDiario = document.getElementById('view-diario');

document.getElementById('btn-diario').addEventListener('click', () => {
  const dateISO = toISO(currentDate);
  const entry = getEntry(dateISO, false);
  document.getElementById('diario-text').value = entry ? (entry.diario || '') : '';
  switchView(viewDiario);
});
document.getElementById('btn-diario-back').addEventListener('click', () => switchView(viewMain));
document.getElementById('diario-text').addEventListener('input', debounce((e) => {
  const dateISO = toISO(currentDate);
  const d = getEntry(dateISO, true);
  d.diario = e.target.value;
  saveState();
}, 400));

function switchView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
  view.classList.add('view-active');
  if(view === viewMain) renderAll();
}

/* ---------------- Export PDF ---------------- */

const modalExport = document.getElementById('modal-export');
document.getElementById('btn-export').addEventListener('click', () => {
  document.getElementById('export-start-date').value = toISO(currentDate);
  document.getElementById('export-week-count').value = 1;
  modalExport.classList.add('open');
});
document.getElementById('export-close').addEventListener('click', () => modalExport.classList.remove('open'));
modalExport.addEventListener('click', (e) => { if(e.target === modalExport) modalExport.classList.remove('open'); });

document.getElementById('export-generate').addEventListener('click', () => {
  const startVal = document.getElementById('export-start-date').value;
  const weekCount = Math.max(1, Math.min(52, parseInt(document.getElementById('export-week-count').value,10) || 1));
  if(!startVal){ showToast('Escolha uma data.'); return; }
  const anchor = fromISO(startVal);
  generatePDF(anchor, weekCount);
  modalExport.classList.remove('open');
});

function generatePDF(anchorDate, weekCount){
  if(typeof window.jspdf === 'undefined'){
    showToast('Não foi possível carregar o gerador de PDF. Verifique sua conexão.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });

  let firstPage = true;
  let weekStart = startOfWeek(anchorDate);

  for(let w=0; w<weekCount; w++){
    if(!firstPage) doc.addPage();
    firstPage = false;
    renderWeekPage(doc, weekStart);
    weekStart = addDays(weekStart, 7);
  }

  const fname = `cartao-diario-${toISO(startOfWeek(anchorDate))}.pdf`;
  doc.save(fname);
  showToast('PDF gerado.');
}

function renderWeekPage(doc, weekStart){
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 30;

  const weekDates = [];
  for(let i=0;i<7;i++) weekDates.push(addDays(weekStart, i));
  const rangeLabel = `${weekDates[0].getDate()} ${MONTH_NAMES[weekDates[0].getMonth()].slice(0,3)}. – ${weekDates[6].getDate()} ${MONTH_NAMES[weekDates[6].getMonth()].slice(0,3)}. de ${weekDates[6].getFullYear()}`;

  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  doc.text('Cartão Diário', margin, 34);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.text(`Semana: ${rangeLabel}`, margin, 50);

  const head = [['', ...WEEKDAY_ABBR_ORDERED()]];

  const body = [];
  const sectionRow = (label) => body.push([{content:label, styles:{fontStyle:'bold', fillColor:[221,230,220]}}, ...Array(7).fill({content:'', styles:{fillColor:[221,230,220]}})]);

  const notaRow = (name, cat) => {
    const row = [name];
    weekDates.forEach(d => {
      const entry = state.entries[toISO(d)];
      const val = entry && entry[cat] && entry[cat][name] ? entry[cat][name].nota : null;
      row.push(val === null || val === undefined ? '' : String(val));
    });
    body.push(row);
  };

  const acaoRow = (name) => {
    const row = [name];
    weekDates.forEach(d => {
      const entry = state.entries[toISO(d)];
      const item = entry && entry.impulsos && entry.impulsos[name];
      row.push(item && item.nota !== null && item.nota !== undefined ? (item.virouAcao ? 'S' : 'N') : '');
    });
    body.push(row);
  };

  const medRow = (name) => {
    const row = [name];
    weekDates.forEach(d => {
      const entry = state.entries[toISO(d)];
      const on = entry && entry.medicacoes && entry.medicacoes[name];
      row.push(entry ? (on ? 'S' : 'N') : '');
    });
    body.push(row);
  };

  sectionRow('Desconforto/Dor');
  state.config.lists.desconfortos.forEach(n => notaRow(n, 'desconfortos'));

  sectionRow('Emoções/Sofrimento');
  EMOCOES_FIXAS.forEach(n => notaRow(n, 'emocoes'));

  sectionRow('Impulso de Ação');
  state.config.lists.impulsos.forEach(n => notaRow(n, 'impulsos'));

  sectionRow('Ações (impulso virou ação?)');
  state.config.lists.impulsos.forEach(n => acaoRow(n));

  sectionRow('Medicações');
  state.config.lists.medicacoes.forEach(n => medRow(n));

  doc.autoTable({
    head,
    body,
    startY: 60,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 4, lineColor: [222,227,214], lineWidth: 0.5, textColor: [43,55,46] },
    headStyles: { fillColor: [78,107,90], textColor: 255, fontStyle: 'bold', halign:'center' },
    columnStyles: {
      0: { cellWidth: 190, fontStyle:'normal' },
      1:{halign:'center'},2:{halign:'center'},3:{halign:'center'},4:{halign:'center'},
      5:{halign:'center'},6:{halign:'center'},7:{halign:'center'}
    },
    theme: 'grid'
  });

  renderDiarioSection(doc, weekDates, doc.lastAutoTable.finalY + 22, margin);
}

function renderDiarioSection(doc, weekDates, startY, margin){
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin*2;
  const bottomLimit = pageHeight - margin;

  const entriesWithText = weekDates
    .map(d => ({ d, text: (state.entries[toISO(d)] && state.entries[toISO(d)].diario || '').trim() }))
    .filter(e => e.text.length > 0);

  if(entriesWithText.length === 0) return;

  let y = startY;

  const ensureSpace = (needed) => {
    if(y + needed > bottomLimit){
      doc.addPage();
      y = margin + 10;
    }
  };

  ensureSpace(20);
  doc.setFont('helvetica','bold');
  doc.setFontSize(11.5);
  doc.setTextColor(58, 82, 69);
  doc.text('Diário', margin, y);
  y += 16;
  doc.setDrawColor(78,107,90);
  doc.setLineWidth(0.7);
  doc.line(margin, y-5, margin + usableWidth, y-5);

  entriesWithText.forEach(({d, text}) => {
    const label = `${WEEKDAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
    ensureSpace(16);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9.5);
    doc.setTextColor(78,107,90);
    doc.text(label, margin, y);
    y += 13;

    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(43,55,46);
    const lines = doc.splitTextToSize(text, usableWidth);
    lines.forEach(line => {
      ensureSpace(12);
      doc.text(line, margin, y);
      y += 12;
    });
    y += 8;
  });
}

function WEEKDAY_ABBR_ORDERED(){
  return ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
}

/* ---------------- Toast ---------------- */

let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- Service worker ---------------- */

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------------- Init ---------------- */

renderAll();
