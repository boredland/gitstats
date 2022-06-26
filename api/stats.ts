import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import getCache from "../utils/getCache";
import github from "../utils/github";
import getShield from "../utils/getShield";
import getCurrentUrl from "../utils/getCurrentUrl";

if (!process.env.GITHUB_PAT) throw new Error("GITHUB_PAT not set");

const octoCache = getCache();
const octokit = github;

type UserQuery = {
  name: string;
  company?: string;
  hubbing_since: string;
};
const getUser = async (username: string): Promise<UserQuery | undefined> => {
  const cacheKey = `exists_${username}`;
  const cachedResult = await octoCache.getItem<UserQuery>(cacheKey);
  if (cachedResult) {
    console.debug("octoCache hit!");
  }
  const result: UserQuery | undefined =
    cachedResult ??
    (await octokit.users
      .getByUsername({ username })
      .then(({ data, status }) => {
        if (status !== 200) return;
        return {
          name: data.name ?? data.login,
          company: data.company ?? undefined,
          hubbing_since: data.created_at,
        };
      })
      .catch((e) => {
        console.error(e);
        return undefined;
      }));

  if (!cachedResult)
    await octoCache.setItem(cacheKey, result, {
      ttl: 60 * 60 * 24,
    });
  return result;
};

type ReposQuery = {
  stargazers_count: number;
  forks_count: number;
  owner: string;
  language?: string;
  name: string;
}[];
const getRepos = async (username: string, page = 0): Promise<ReposQuery> => {
  const per_page = 50;
  const cacheKey = `repos_${username}_p${page}_pp${per_page}`;
  const cachedResult = await octoCache.getItem<ReposQuery>(cacheKey);
  if (cachedResult) {
    console.debug("octoCache hit!");
  }
  const result: ReposQuery =
    cachedResult ??
    (await octokit.repos
      .listForUser({
        username,
        sort: "created",
        direction: "asc",
        page,
        per_page,
        type: "all",
      })
      .then((result) =>
        result.data.map(
          ({ stargazers_count, owner, forks_count, language, name }) => ({
            stargazers_count: stargazers_count ?? 0,
            owner: owner.login,
            name,
            forks_count: forks_count ?? 0,
            language: language ?? undefined,
          })
        )
      )
      .catch((e) => {
        console.error(e);
        return [];
      }));

  if (!cachedResult)
    await octoCache.setItem(cacheKey, result, {
      ttl: result.length === per_page ? 60 * 60 * 24 : 60 * 60,
    });

  if (result.length === per_page) {
    return [...result, ...(await getRepos(username, page + 1))];
  }
  return result;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  
  const input = await z
    .object({
      user: z.string(),
    })
    .safeParseAsync(req.query);

  console.debug(input);

  if (!input.success) {
    res.status(400);
    return res.json(input);
  }

  const user = await getUser(input.data.user);
  if (!user) {
    res.status(400);
    return res.send(`user ${input.data.user} not found`);
  }

  const repos = await getRepos(input.data.user);
  const repos_counts = repos.reduce(
    (previous, current) => {
      if (current.owner === input.data.user) previous.owned_count++;
      previous.forks_count += current.forks_count;
      previous.stargazers_count += current.stargazers_count;
      if (current.language) {
        if (previous.languages[current.language])
          previous.languages[current.language]++;
        if (!previous.languages[current.language])
          previous.languages[current.language] = 1;
      }
      return previous;
    },
    {
      owned_count: 0,
      stargazers_count: 0,
      forks_count: 0,
      languages: {} as Record<string, number>,
    }
  );

   const result = {
    name: user.name,
    company: user.company,
    hubbing_since: user.hubbing_since,
    repo_count: repos.length,
    repo_owned_count: repos_counts.owned_count,
    stargazers_count: repos_counts.stargazers_count,
    forks: repos_counts.forks_count,
    languages: Object.entries(repos_counts.languages)
      .sort((a, b) => b[1] - a[1])
      .map((v) => v[0]),
  }

  const shields = {
    repo_count: getShield<typeof result>(getCurrentUrl(req), 'repo_count', 'repos'),
    forks: getShield<typeof result>(getCurrentUrl(req), 'forks', 'forks'),
    stargazers_count: getShield<typeof result>(getCurrentUrl(req), 'stargazers_count', 'stars')
  }

  res.json({
    ...result,
    shields
  });
}
