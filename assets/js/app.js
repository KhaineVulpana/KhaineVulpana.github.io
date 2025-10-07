import { getToken, setToken, aggregateLanguages, sortLangs } from './github.js';

const donutCtx = () => document.getElementById('langDonut').getContext('2d');
const barsCtx = () => document.getElementById('langBars').getContext('2d');
let donutChart = null;
let barsChart = null;
let projectCharts = [];

const maroonShades = ['#5a0d21', '#92265a', '#b63e71', '#d45c88', '#f6b3c8'];
const blueShades = ['#112a63', '#1b56d6', '#2f7bff', '#5fa8ff', '#8ecaff'];
const grayShades = ['#111315', '#1f232b', '#2e3440', '#4b5563', '#9aa4b2', '#e7edf3'];

const colorFamilies = [
  { shades: maroonShades, order: 'darkToLight' },
  { shades: blueShades, order: 'lightToDark' },
  { shades: grayShades, order: 'lightToDark' }
];

const shadeSequence = (() => {
  const orientedFamilies = colorFamilies.map(({ shades, order }) => {
    const list = [...shades];
    if(order === 'lightToDark') list.reverse();
    return list;
  });

  const max = Math.max(...orientedFamilies.map(list => list.length));
  const sequence = [];
  for(let i = 0; i < max; i++){
    for(const list of orientedFamilies){
      if(list[i]) sequence.push(list[i]);
    }
  }
  return sequence.filter(Boolean);
})();

const languageColors = new Map();
let shadeIndex = 0;

function resetLanguageColors(){
  languageColors.clear();
  shadeIndex = 0;
}

function colorForLanguage(label){
  if(label === 'Other') return '#9aa4b2';
  if(!label) return '#2e3440';
  if(!languageColors.has(label)){
    const color = shadeSequence[shadeIndex] || shadeSequence[shadeIndex % shadeSequence.length] || '#9aa4b2';
    languageColors.set(label, color);
    shadeIndex++;
  }
  return languageColors.get(label);
}

function ensureLanguageColors(languageList){
  for(const lang of languageList){
    if(lang && lang !== 'Other') colorForLanguage(lang);
  }
}

function colorsForLabels(labels){
  return labels.map(label => colorForLanguage(label));
}

function computeSlices(entries, total, { max=12, minShare=0.01 } = {}){
  const labels = [];
  const values = [];
  let other = 0;
  for(const [label, value] of entries){
    const share = total ? value / total : 0;
    if(labels.length < max || share >= minShare){
      labels.push(label);
      values.push(value);
    }else{
      other += value;
    }
  }
  if(other > 0){
    labels.push('Other');
    values.push(other);
  }
  return { labels, values };
}

function renderDonut(labels, values){
  if(donutChart) donutChart.destroy();
  donutChart = new Chart(donutCtx(), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, borderWidth: 0, backgroundColor: colorsForLabels(labels) }] },
    options: { plugins: { legend: { labels: { color: '#e7edf3' } } } }
  });
}

function renderBars(labels, values){
  if(barsChart) barsChart.destroy();
  barsChart = new Chart(barsCtx(), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, borderWidth: 0, backgroundColor: colorsForLabels(labels), borderRadius: 6 }] },
    options: {
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: '#e7edf3' }, grid: { color: '#2e3440' } },
        y: { ticks: { color: '#e7edf3' }, grid: { display:false } }
      },
      plugins: { legend: { display:false } }
    }
  });
}

function renderProjects(list, repoLangMap){
  const grid = document.getElementById('projectGrid');
  grid.innerHTML = '';
  projectCharts.forEach(chart => chart.destroy());
  projectCharts = [];
  for(const r of list){
    const card = document.createElement('div');
    card.className = 'project';
    const topics = (r.topics||[]).slice(0,4).map(t=>`<span class="tag-chip">${t}</span>`).join(' ');
    const desc = r.description ? r.description : 'No description provided.';
    const chartId = `projectChart-${r.name.replace(/[^a-z0-9]/gi,'-')}`;
    card.innerHTML = `
      <div class="project-content">
        <div class="project-info">
          <h4><a href="${r.html_url}" target="_blank" rel="noopener">${r.name}</a></h4>
          <p class="muted">${desc}</p>
          <div class="tags">${topics}</div>
          <p class="tiny muted">★ ${r.stargazers_count || 0} · Updated ${new Date(r.updated_at).toLocaleDateString()}</p>
        </div>
        <div class="project-chart">
          <canvas id="${chartId}" width="140" height="140" aria-label="Language breakdown for ${r.name}" role="img"></canvas>
        </div>
      </div>
    `;
    grid.appendChild(card);

    const langData = repoLangMap[r.name] || r.languages || {};
    const entries = Object.entries(langData).sort((a,b)=>b[1]-a[1]);
    const total = entries.reduce((acc,[,v])=>acc+v,0);
    const canvas = document.getElementById(chartId);

    if(!entries.length || total === 0){
      const chartContainer = card.querySelector('.project-chart');
      chartContainer.innerHTML = '<p class="tiny muted">No language data</p>';
      continue;
    }

    const { labels, values } = computeSlices(entries, total, { max:6, minShare:0.03 });
    const backgroundColor = colorsForLabels(labels);

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          borderWidth: 0,
          backgroundColor,
        }]
      },
      options: {
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e7edf3', boxWidth: 10, font: { size: 10 } }
          }
        }
      }
    });
    projectCharts.push(chart);
  }
}

function setStats(repoCount, topLanguage, stars){
  document.getElementById('repoCount').textContent = repoCount;
  document.getElementById('topLang').textContent = topLanguage || '—';
  document.getElementById('stars').textContent = Number(stars || 0).toLocaleString();
  document.getElementById('year').textContent = new Date().getFullYear();
}

function showError(msg){
  console.error(msg);
  const grid = document.getElementById('projectGrid');
  grid.innerHTML = `<p class="muted">${msg}</p>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // token UI
  const inp = document.getElementById('ghToken');
  const save = document.getElementById('saveToken');
  save.addEventListener('click', ()=>{
    const v = inp.value.trim();
    if(v){ setToken(v); alert('Token saved locally. Reload to use.'); }
  });

  try{
    const { repos, topStarred, aggregate, repoLangs, stars } = await aggregateLanguages();
    const sorted = sortLangs(aggregate);
    if(sorted.length === 0){
      showError('No language data found. Add a token or check if repos are public.');
      return;
    }

    const total = sorted.reduce((a,[,v])=>a+v,0);
    resetLanguageColors();
    ensureLanguageColors(sorted.map(([lang]) => lang));

    const { labels, values } = computeSlices(sorted, total, { max:16, minShare:0.005 });

    renderDonut(labels, values);
    renderBars(labels, values.map(v=>Math.round(v/1024)));
    renderProjects(topStarred, repoLangs);
    setStats(repos.length, labels[0], stars);

  }catch(err){
    const extra = err && typeof err.message === 'string' && err.message.toLowerCase().includes('rate limit')
      ? ' Add a GitHub token above to increase the limit.'
      : '';
    showError('GitHub fetch failed. Open DevTools → Console for details. ' + err.message + extra);
  }
});
