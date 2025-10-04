// Utility module to fetch GitHub language data
const GH_USER = 'KhaineVulpana';
const EXCLUDED_REPOS = new Set(['VB-Custom']);

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
  return repos.filter(r => !r.fork && !EXCLUDED_REPOS.has(r.name));
}

export async function aggregateLanguages(username=GH_USER){
  const repos = await fetchRepos(username);
  const aggregate = {};
  const repoLangs = {};
  let stars = 0;

  for(const repo of repos){
    stars += repo.stargazers_count || 0;
    try{
      const langs = await ghFetch(`https://api.github.com/repos/${username}/${repo.name}/languages`);
      repoLangs[repo.name] = langs;
      for(const [lang, bytes] of Object.entries(langs)){
        aggregate[lang] = (aggregate[lang] || 0) + bytes;
      }
    }catch(err){
      console.warn('Language fetch failed for', repo.name, err);
    }
  }

  const topStarred = [...repos]
    .sort((a,b)=> (b.stargazers_count||0)-(a.stargazers_count||0))
    .slice(0, 24)
    .map(repo => ({ ...repo, languages: repoLangs[repo.name] || {} }));

  return { repos, topStarred, aggregate, repoLangs, stars };
}

export function sortLangs(obj){
  return Object.entries(obj).sort((a,b)=> b[1]-a[1]);
}
