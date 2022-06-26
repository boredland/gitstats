// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import getCache from "../utils/getCache";
import github from "../utils/github";

const octokit = github;
const octoCache = getCache();
const resultCache = getCache();

const numberFormat = new Intl.NumberFormat("en-US");

const fetchReleaseIDs = async (args: {
  owner: string;
  repo: string;
  per_page: number;
  page: number | undefined;
}) => {
  const cacheKey = "release_ids_" + JSON.stringify(args);
  const cachedResult = await octoCache.getItem<number[]>(cacheKey);
  if (cachedResult) {
    console.debug("octoCache hit!");
  }

  const result: number[] =
    cachedResult ??
    (await octokit.repos.listReleases(args)).data.map((release) => release.id);
    
  if (!cachedResult)
    await octoCache.setItem(cacheKey, result, {
      ttl: result.length === args.per_page ? 60 * 60 * 24 : 60 * 60,
    });

  return result;
};

const calculateResult = async ({
  repoConf,
  suffixes,
}: {
  repoConf: { owner: string; repo: string };
  suffixes?: string[];
}) => {
  const cacheKey = 'release_count_' + JSON.stringify({ repoConf, suffixes });
  const cachedResult = await resultCache.getItem<string>(cacheKey);
  if (cachedResult) {
    console.debug("resultCache hit!");
    return cachedResult;
  }

  console.debug("calculating...");
  let releaseIds = new Set<number>();
  let page = 0;

  do {
    const newReleaseIds = await fetchReleaseIDs({
      ...repoConf,
      per_page: 30,
      page,
    });
    if (!newReleaseIds.length) {
      break;
    }
    newReleaseIds.map((id) => releaseIds.add(id));
    page++;
  } while (true);

  const downloadsByRelease = await Promise.all(
    Array.from(releaseIds).map(async (release_id) => {
      const assets = await octokit.repos.listReleaseAssets({
        ...repoConf,
        release_id,
      });

      if (!!suffixes) {
        const filteredAssets = assets.data.filter((asset) => {
          const nameElements = asset.name.split(".");
          return suffixes.includes(nameElements[nameElements.length - 1]);
        });
        return filteredAssets
          .map((asset) => asset.download_count)
          .filter((value) => value !== -Infinity)
          .reduce((pv, cv) => pv + cv, 0);
      }

      const downloadCounts = assets.data.map((asset) => asset.download_count);
      return Math.max(...downloadCounts);
    })
  );

  const totalDownloads = downloadsByRelease
    .filter((value) => value !== -Infinity)
    .reduce((pv, cv) => pv + cv, 0);

  console.debug("finished calculating...");
  const result = numberFormat.format(totalDownloads);
  await resultCache.setItem(cacheKey, result, { ttl: 360 });
  return result;
};

type GetRepoQuery = {
  owner: string;
  repo: string;
  created_at: string;
};
const getRepo = async (args: { owner: string; repo: string }) => {
  const cacheKey = "repo_" + JSON.stringify(args);
  const cachedResult = await octoCache.getItem<GetRepoQuery>(cacheKey);

  const result: GetRepoQuery | undefined =
    cachedResult ??
    (await octokit.repos
      .get(args)
      .then(({ data: { owner, created_at, name } }) => ({
        owner: owner.login,
        created_at,
        repo: name,
      }))
      .catch((error) => {
        console.error(error);
        return undefined;
      }));

  if (!cachedResult)
    await octoCache.setItem(cacheKey, result, {
      ttl: 60 * 60 * 24,
    });
  return result;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const currentUrl = new URL(
    `https://releases-count.manjaro-sway.download${req.url}`
  );
  if (req.headers["x-forwarded-host"]) {
    currentUrl.host = req.headers["x-forwarded-host"] as string;
  }

  const input = await z
    .object({
      owner: z.string(),
      repo: z.string(),
      suffixes: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(",") : undefined)),
    })
    .safeParseAsync(req.query);

  console.debug(input);

  if (!input.success) {
    res.status(400);
    return res.json(input.error.errors);
  }

  const repoConf = {
    owner: input.data.owner,
    repo: input.data.repo,
  };

  const repoInfo = await getRepo(repoConf);

  if (!repoInfo) return;

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200);

  const total = await calculateResult({
    repoConf,
    suffixes: input.data.suffixes,
  });

  res.json({
    count: total,
    shield: `https://img.shields.io/badge/dynamic/json?color=green&label=manjaro-sway&cache=3600&query=count&url=${encodeURIComponent(
      currentUrl.toString()
    )}`,
  });
}
