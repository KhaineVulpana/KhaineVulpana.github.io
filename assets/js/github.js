// Utility module to fetch GitHub language data
const GH_USER = 'KhaineVulpana';

export function getToken(){ return window.localStorage.getItem('gh_token') || ''; }
export function setToken(t){ if(t) window.localStorage.setItem('gh_token', t); }

async function ghFetch(url){
  const headers = { 'Accept': 'application/vnd.github+json' };
  const t = getToken();
  if(t) headers['Authorization'] = 'Bearer ' + t;
  const r = await fetch(url, { headers });
  if(!r.ok){
    const body = await r.text();
    throw new Error('GitHub request failed: ' + r.status + ' ' + body);
  }
  return r.json();
}

export async function fetchRepos(username=GH_USER){
  const repos = [];
  let page = 1;
  while(page <= 2){
    const chunk = await ghFetch(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}&type=owner&sort=updated`);
    repos.push(...chunk);
    if(chunk.length < 100) break;
    page++;
  }
  return repos.filter(r => !r.fork);
}

export async function aggregateLanguages(username=GH_USER){
  const repos = await fetchRepos(username);
  const topStarred = [...repos].sort((a,b)=> (b.stargazers_count||0)-(a.stargazers_count||0)).slice(0, 24);

  const allLangs = {};
  let stars = 0;
  await Promise.all(topStarred.map(async (r) => {
    stars += r.stargazers_count || 0;
    const langs = await ghFetch(`https://api.github.com/repos/${username}/${r.name}/languages`);
    for(const [lang, bytes] of Object.entries(langs)){
      allLangs[lang] = (allLangs[lang] || 0) + bytes;
    }
  }));

  return { repos, topStarred, aggregate: allLangs, stars };
}

export function sortLangs(obj){
  return Object.entries(obj).sort((a,b)=> b[1]-a[1]);
}
