import { getToken, setToken, aggregateLanguages, sortLangs } from './github.js';

const donutCtx = () => document.getElementById('langDonut').getContext('2d');
const barsCtx = () => document.getElementById('langBars').getContext('2d');
let donutChart = null;
let barsChart = null;

function palette(n){
  const base = ['#8ecaff','#a1d4ff','#b5ddff','#c9e6ff','#dcedff','#f5f7fa','#800020','#9a0f2b','#b31b35','#cd2740','#e7334a','#5a0d21'];
  const out = [];
  for(let i=0;i<n;i++) out.push(base[i % base.length]);
  return out;
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
    data: { labels, datasets: [{ data: values, borderWidth: 0 }] },
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

function renderProjects(list){
  const grid = document.getElementById('projectGrid');
  grid.innerHTML = '';
  for(const r of list){
    const card = document.createElement('div');
    card.className = 'project';
    const topics = (r.topics||[]).slice(0,4).map(t=>`<span class="tag-chip">${t}</span>`).join(' ');
    const desc = r.description ? r.description : 'No description provided.';
    card.innerHTML = `
      <h4><a href="${r.html_url}" target="_blank" rel="noopener">${r.name}</a></h4>
      <p class="muted">${desc}</p>
      <div class="tags">${topics}</div>
      <p class="tiny muted">★ ${r.stargazers_count || 0} · Updated ${new Date(r.updated_at).toLocaleDateString()}</p>
    `;
    grid.appendChild(card);
  }
}

function setStats(repoCount, topLanguage, stars){
  document.getElementById('repoCount').textContent = repoCount;
  document.getElementById('topLang').textContent = topLanguage || '—';
  document.getElementById('stars').textContent = stars;
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
    const { repos, topStarred, aggregate, stars } = await aggregateLanguages();
    const sorted = sortLangs(aggregate);
    if(sorted.length === 0){
      showError('No language data found. Add a token or check if repos are public.');
      return;
    }

    const labels = sorted.slice(0,8).map(([k])=>k);
    const values = sorted.slice(0,8).map(([,v])=>v);
    const others = sorted.slice(8).reduce((a,[,v])=>a+v,0);
    if(others>0){ labels.push('Other'); values.push(others); }

    renderDonut(labels, values);
    renderBars(labels, values.map(v=>Math.round(v/1024)));
    renderProjects(topStarred);
    setStats(repos.length, labels[0], stars);

  }catch(err){
    showError('GitHub fetch failed. Open DevTools → Console for details. ' + err.message);
  }
});
