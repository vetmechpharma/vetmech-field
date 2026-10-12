import {APP_NAME,COMPANY_NAME} from './branding';
import {columnWeight,numericColumn} from './report-layout';
/** Export only data already rendered in the current user's selected view. */
export type ExportTable = {title: string; columns: string[]; rows: string[][]};
export type ViewSnapshot = {title: string; generated: string; filters: string[]; tables: ExportTable[]; layout?: 'customer-directory'};
const clean = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
const excluded = (node: Element) => !!node.closest('[hidden],.print-only,.view-tools,dialog,.no-export');
const closedDetails = (node: Element) => !!node.closest('details:not([open])') && !node.closest('summary');
function cellText(node: Element) {
  if(node.closest('[data-export-kind="customer-directory"]')){
    const phones=node.querySelector('.customer-contact');
    if(phones)return Array.from(phones.children).map(p=>clean(p.querySelector('span')?.textContent||p.textContent)).join(' / ');
    const location=node.querySelector('.customer-location>span');if(location)return clean(location.textContent);
  }
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('input,select,textarea,svg,.icon-button,.row-actions,.priority-badges').forEach(el => el.remove());
  return clean(copy.textContent);
}

export function captureView(root: HTMLElement, title: string): ViewSnapshot {
  const tables: ExportTable[] = [];
  const metrics = Array.from(root.querySelectorAll('.stat,.hub-metric,.target-cards>div:not(.target-bar),.report-metrics>div,.attendance-summary>div'))
    .filter(el => !excluded(el)).map(el => {
      const value = el.querySelector('strong');
      const label = el.querySelector('.stat-top,.metric-label,span');
      const copy = el.cloneNode(true) as Element;
      copy.querySelectorAll('strong,small,svg').forEach(n => n.remove());
      return [clean(label?.textContent || copy.textContent), clean(value?.textContent)];
    }).filter(row => row[0] && row[1]);
  if (metrics.length) tables.push({title: 'Summary', columns: ['Metric', 'Value'], rows: metrics});

  root.querySelectorAll('table').forEach((table, index) => {
    if (excluded(table) || closedDetails(table)) return;
    const header = table.tHead?.rows[0];
    if (!header) return;
    const keep = Array.from(header.cells).map((cell, i) => ({name: cellText(cell), i}))
      .filter(({name}) => name && !/^(actions?|manage|edit|delete)$/i.test(name));
    const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows))
      .filter(row => !excluded(row))
      .map(row => keep.map(({i}) => row.cells[i] ? cellText(row.cells[i]) : ''));
    if (!keep.length) return;
    const context = table.closest('.report-section,.panel,section,article');
    const heading = context?.querySelector('h2,h3');
    tables.push({title: clean(table.caption?.textContent || heading?.textContent) || `${title} · Table ${index + 1}`, columns: keep.map(k => k.name), rows});
  });

  // Card-based pages (orders, benefits, follow-ups, team and inbox) have no table.
  const candidates = Array.from(root.querySelectorAll('.invoice-card,.stock-card,.followup-action,.member-card,.inbox-item,.draft-row,.audit-event,.approval-card,.ledger-list,.location-card,.message-card'));
  for (const card of candidates) {
    if (excluded(card) || candidates.some(other => other !== card && card.contains(other))) continue;
    const copy = card.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('table,.report-scroll,button:not(.inbox-item),input,select,textarea,label,svg,.order-controls,.row-actions,.no-print,.web-only,.form-error').forEach(n => n.remove());
    if (card.tagName === 'DETAILS' && !card.hasAttribute('open')) {
      const summary = copy.querySelector('summary');
      copy.replaceChildren(...(summary ? [summary] : []));
    }
    const heading = clean(copy.querySelector('h2,h3,summary b,.inbox-content b')?.textContent) || title;
    copy.querySelectorAll('h2,h3').forEach(n => n.remove());
    copy.querySelectorAll('p,div,small,dd,dt,li,summary,pre').forEach(n => n.append('\n'));
    const details = (copy.textContent || '').split('\n').map(clean).filter(Boolean).join('\n');
    if (details) tables.push({title: heading, columns: ['Recorded details'], rows: [[details]]});
  }
  const filters = Array.from(root.querySelectorAll<HTMLLabelElement>('.admin-filters label,.workflow-toolbar label,.inline-filter,.activity-filter label'))
    .filter(label => !excluded(label))
    .flatMap(label => {
      const input = label.querySelector('select,input[type=month],input[type=date],input[type=search]') as HTMLInputElement | HTMLSelectElement | null;
      if (!input) return [];
      const name = label.cloneNode(true) as Element;
      name.querySelectorAll('input,select,button').forEach(n => n.remove());
      const value = input.tagName === 'SELECT' ? (input as HTMLSelectElement).selectedOptions[0]?.text : input.value;
      return value ? [`${clean(name.textContent)}: ${clean(value)}`] : [];
    });
  return {layout:root.querySelector('[data-export-kind="customer-directory"]')?'customer-directory':undefined,title, generated: new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}) + ' IST', filters, tables};
}

export function csvCell(value: unknown) {
  let text = String(value ?? '');
  // Spreadsheet formulas can start after leading whitespace or control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function snapshotCSV(snapshot: ViewSnapshot) {
  const rows: unknown[][] = [[APP_NAME, snapshot.title], ['Generated', snapshot.generated], ...snapshot.filters.map(f => ['Filter', f]), ['Scope', 'Current selection and loaded records; expand order details before export.']];
  for (const table of snapshot.tables) rows.push([], [table.title], table.columns, ...table.rows);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function downloadViewCSV(snapshot: ViewSnapshot) {
  if (!snapshot.tables.length) throw new Error('No report data is loaded in this view. Select records or open a report first.');
  const url = URL.createObjectURL(new Blob([snapshotCSV(snapshot)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `VETMECH-${snapshot.title.replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function snapshotReport(snapshot: ViewSnapshot) {
  if (!snapshot.tables.length) throw new Error('No report data is loaded in this view. Select records or open a report first.');
  const article = document.createElement('article');const directory=snapshot.layout==='customer-directory';article.className = 'monthly-report view-report'+(directory?' customer-directory-report':'');
  const add = (parent: Element, tag: string, text: string, className = '') => {
    const node = document.createElement(tag);node.textContent = text;if(className) node.className = className;parent.appendChild(node);return node;
  };
  const header = document.createElement('header');header.className = 'report-cover';article.appendChild(header);
  add(header, 'span', COMPANY_NAME, 'eyebrow');
  add(header, 'h2', snapshot.title);add(header, 'p', `Generated ${snapshot.generated}`);
  if(snapshot.filters.length) add(header, 'p', snapshot.filters.join(' · '));
  add(header, 'p', directory?'One customer per row · Current selection and loaded records.':'Current selection and loaded records. Expand order details before exporting.');
  const tones = ['teal','blue','purple','orange','rose','cyan'];
  snapshot.tables.forEach((table, i) => {
    // Split wide tables into linked column groups, keeping an identifying row number.
    const width = directory?Math.max(1,table.columns.length):6;
    const sets = Math.ceil(table.columns.length / width);
    for(let part = 0; part < sets; part++) {
      const start = part * width, end = start + width;
      const section = document.createElement('section');section.className = `report-section tone-${tones[i % tones.length]}`;article.appendChild(section);
      const heading = document.createElement('div');heading.className = 'report-section-heading';section.appendChild(heading);
      add(heading, 'span', String(i + 1).padStart(2,'0'), 'section-number');
      add(heading, 'h3', table.title + (sets > 1 ? ` · Columns ${start + 1}–${Math.min(end,table.columns.length)}` : ''));
      if(sets > 1) add(section,'p','Match the same row number across column groups.','report-note');
      const el = document.createElement('table');section.appendChild(el);
      const head = el.createTHead().insertRow();
      const cols = table.columns.slice(start,end);
      const labels=sets > 1 ? ['Row',...cols] : cols;
      const directoryWeights:Record<string,number>={Name:14,Type:8,Route:8,Address:17,Email:13,Phone:10,'Registration no':7,'Date of birth':7,Location:14,Representative:9};
      const weights=labels.map(label=>directory?(directoryWeights[label]||8):columnWeight(label)),total=weights.reduce((a,b)=>a+b,0);
      const colgroup=document.createElement('colgroup');el.insertBefore(colgroup,el.firstChild);
      weights.forEach(w=>{const col=document.createElement('col');col.style.width=w/total*100+'%';colgroup.appendChild(col)});
      labels.forEach(col => add(head,'th',col,numericColumn(col)?'numeric':''));
      const body = el.createTBody();
      table.rows.forEach((row, rowIndex) => {
        const tr = body.insertRow();
        (sets > 1 ? [String(rowIndex+1),...row.slice(start,end)] : row).forEach((value,j) => add(tr,'td',value,numericColumn(labels[j])?'numeric':''));
      });
      if(!table.rows.length) add(section,'p','No records for this selection.','report-empty');
    }
  });
  add(article,'footer',`Confidential company review · ${APP_NAME}`,'report-end');
  return article;
}
