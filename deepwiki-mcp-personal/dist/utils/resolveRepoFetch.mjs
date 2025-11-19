import { fetch } from 'undici';

async function resolveRepo(keyword) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    `${keyword} in:name`
  )}&per_page=1`;
  const headers = {
    Accept: "application/vnd.github+json"
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok)
    throw new Error(`GitHub error: ${res.status}`);
  const { items } = await res.json();
  if (!items?.length)
    throw new Error("no match");
  return items[0].full_name;
}

export { resolveRepo };
