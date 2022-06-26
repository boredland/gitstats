import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Octokit } from "@octokit/rest";
import { CacheContainer } from "node-ts-cache";
import { z } from "zod";
import IoRedis from "ioredis";
import { IoRedisStorage } from "node-ts-cache-storage-ioredis";

if (!process.env.GITHUB_PAT) throw new Error("GITHUB_PAT not set");
if (!process.env.REDIS_URL) throw new Error("GITHUB_PAT not set");

const ioRedisInstance = new IoRedis(process.env.REDIS_URL);
const octoCache = new CacheContainer(new IoRedisStorage(ioRedisInstance));
const resultCache = new CacheContainer(new IoRedisStorage(ioRedisInstance));

type UserQuery = {
  name: string;
  company?: string;
  hubbing_since: string;
};
const getUser = async (
  octokit: Octokit,
  username: string
): Promise<UserQuery | undefined> => {
  const cacheKey = `b${username}_exists`;
  const cachedResult = await octoCache.getItem<UserQuery>(cacheKey);
  if (cachedResult) {
    console.debug("octoCache hit!");
  }
  const result =
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
const getRepos = async (
  octokit: Octokit,
  username: string,
  page = 0
): Promise<ReposQuery> => {
  const per_page = 10;
  const cacheKey = `e${username}_repos_p${page}_pp${per_page}`;
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

  await octoCache.setItem(cacheKey, result, {
    ttl: result.length === per_page ? 60 * 60 * 24 : 60 * 60,
  });

  if (result.length === per_page) {
    return [...result, ...(await getRepos(octokit, username, page + 1))];
  }
  return result;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
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

  const user = await getUser(octokit, input.data.user);
  if (!user) {
    res.status(400);
    return res.send(`user ${input.data.user} not found`);
  }

  const repos = await getRepos(octokit, input.data.user);
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

  res.json({
    name: user.name,
    company: user.company,
    hubbing_since: user.hubbing_since,
    repo_count: repos.length,
    repo_owned_count: repos_counts.owned_count,
    stargazers: repos_counts.stargazers_count,
    forks: repos_counts.forks_count,
    languages: Object.entries(repos_counts.languages)
      .sort((a, b) => b[1] - a[1])
      .map((v) => v[0]),
  });
}
