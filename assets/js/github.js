// Utility module to fetch GitHub language data
const GH_USER = 'KhaineVulpana';
const EXCLUDED_REPOS = new Set(['VB-Custom']);

function readStoredToken(){
  if(typeof window === 'undefined' || !window.localStorage) return '';
  try{
    return window.localStorage.getItem('gh_token') || '';
  }catch(_err){
    return '';
  }
}

function resolveEmbeddedToken(){
  let token = '';

  if(typeof document !== 'undefined'){
    const moduleScript = document.querySelector('script[type="module"][src$="assets/js/app.js"]');
    if(moduleScript && moduleScript.dataset && typeof moduleScript.dataset.githubToken === 'string'){
      const trimmed = moduleScript.dataset.githubToken.trim();
      if(trimmed) token = trimmed;
    }

    if(!token){
      const meta = document.querySelector('meta[name="github-token"]');
      if(meta && typeof meta.content === 'string'){
        const trimmedMeta = meta.content.trim();
        if(trimmedMeta) token = trimmedMeta;
      }
    }
  }

  if(!token && typeof window !== 'undefined' && typeof window.__GITHUB_TOKEN__ === 'string'){
    const fromGlobal = window.__GITHUB_TOKEN__.trim();
    if(fromGlobal) token = fromGlobal;
  }

  return token;
}

const EMBEDDED_TOKEN = resolveEmbeddedToken();

export function hasEmbeddedToken(){
  return Boolean(EMBEDDED_TOKEN);
}

export function getStoredToken(){
  return readStoredToken();
}

export function getToken(){
  const stored = readStoredToken();
  return stored || EMBEDDED_TOKEN;
}

export function setToken(t){
  if(typeof window === 'undefined' || !window.localStorage) return;
  try{
    if(t){
      window.localStorage.setItem('gh_token', t);
    }else{
      window.localStorage.removeItem('gh_token');
    }
  }catch(_err){ /* ignore */ }
}

async function ghFetch(url){
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const t = getToken();
  if(t) headers['Authorization'] = 'Bearer ' + t;
  let r;
  try{
    r = await fetch(url, { headers, cache: 'no-store' });
  }catch(err){
    throw new Error('GitHub request failed: network error ' + err.message);
  }

  if(r.status === 403){
    const remaining = r.headers.get('x-ratelimit-remaining');
    const reset = r.headers.get('x-ratelimit-reset');
    let resetDate = '';
    if(reset){
      const ts = Number(reset) * 1000;
      if(!Number.isNaN(ts)){
        resetDate = new Date(ts).toLocaleTimeString();
      }
    }
    let detail = '';
    try{
      const body = await r.json();
      if(body && body.message) detail = body.message;
    }catch(_err){ /* ignore parse errors */ }
    throw new Error(`GitHub rate limit hit. Remaining: ${remaining}. ${detail || ''} ${resetDate ? 'Resets at ' + resetDate + '.' : ''}`.trim());
  }

  if(!r.ok){
    let bodyText = '';
    try{
      bodyText = await r.text();
    }catch(_err){ /* ignore */ }
    throw new Error('GitHub request failed: ' + r.status + (bodyText ? ' ' + bodyText : ''));
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

function concurrencyLimit(count){
  if(!Number.isFinite(count) || count <= 0) return 1;
  if(count >= 30) return 6;
  if(count >= 15) return 5;
  if(count >= 7) return 4;
  if(count >= 3) return 3;
  return 2;
}

export async function aggregateLanguages(username=GH_USER){
  const repos = await fetchRepos(username);
  const aggregate = {};
  const repoLangs = {};
  let stars = 0;

  for(const repo of repos){
    stars += repo.stargazers_count || 0;
  }

  const maxWorkers = concurrencyLimit(repos.length);
  let index = 0;

  async function worker(){
    while(true){
      const repo = repos[index++];
      if(!repo) break;
      try{
        const langs = await ghFetch(repo.languages_url || `https://api.github.com/repos/${username}/${repo.name}/languages`);
        repoLangs[repo.name] = langs;
        for(const [lang, bytes] of Object.entries(langs)){
          aggregate[lang] = (aggregate[lang] || 0) + bytes;
        }
      }catch(err){
        console.warn('Language fetch failed for', repo.name, err);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxWorkers, Math.max(1, repos.length)) }, () => worker()));

  const topStarred = [...repos]
    .sort((a,b)=> (b.stargazers_count||0)-(a.stargazers_count||0))
    .slice(0, 24)
    .map(repo => ({ ...repo, languages: repoLangs[repo.name] || {} }));

  return { repos, topStarred, aggregate, repoLangs, stars };
}

export function sortLangs(obj){
  return Object.entries(obj).sort((a,b)=> b[1]-a[1]);
}
