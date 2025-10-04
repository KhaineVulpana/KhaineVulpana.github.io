import { getToken, setToken, aggregateLanguages, sortLangs } from './github.js';

const donutCtx = () => document.getElementById('langDonut').getContext('2d');
const barsCtx = () => document.getElementById('langBars').getContext('2d');
let donutChart = null;
let barsChart = null;
let projectCharts = [];

const brandPalette = [
  '#8ecaff', '#5fa8ff', '#2f7bff', '#1b56d6',
  '#f6b3c8', '#e985a8', '#d45c88', '#b63e71', '#92265a', '#5a0d21',
  '#a8f0e4', '#6fd5c2', '#3db6a3', '#2f8c8c',
  '#fad48b', '#f6a768', '#f07e5f', '#d95c59', '#9c62ff', '#7e4cff'
];

function palette(n){
  const out = [];
  for(let i=0;i<n;i++) out.push(brandPalette[i % brandPalette.length]);
  return out;
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
    data: { labels, datasets: [{ data: values, borderWidth: 0, backgroundColor: palette(values.length) }] },
    options: { plugins: { legend: { labels: { color: '#e7edf3' } } } }
  });
}

function renderBars(labels, values){
  if(barsChart) barsChart.destroy();
  barsChart = new Chart(barsCtx(), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, borderWidth: 0, backgroundColor: palette(values.length), borderRadius: 6 }] },
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

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          borderWidth: 0,
          backgroundColor: palette(values.length),
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
    const { labels, values } = computeSlices(sorted, total, { max:16, minShare:0.005 });

    renderDonut(labels, values);
    renderBars(labels, values.map(v=>Math.round(v/1024)));
    renderProjects(topStarred, repoLangs);
    setStats(repos.length, labels[0], stars);

  }catch(err){
    showError('GitHub fetch failed. Open DevTools → Console for details. ' + err.message);
  }
});
