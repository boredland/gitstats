// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "@octokit/rest";
import { Cache, CacheContainer } from 'node-ts-cache'
import { MemoryStorage } from 'node-ts-cache-storage-memory'

const octoCache = new CacheContainer(new MemoryStorage())
const resultCache = new CacheContainer(new MemoryStorage())

type Data = {
  count?: string;
  error?: string;
};

const numberFormat = new Intl.NumberFormat("en-US");

const fetchReleaseIDs = async (octokit: Octokit, args: { owner: string; repo: string; per_page: number; page: number | undefined }) => {
  const fn = octokit.repos.listReleases;
  const cacheKey = JSON.stringify(args);
  const cachedResult = await octoCache.getItem<ReturnType<typeof fn>>(cacheKey);
  if (cachedResult) return cachedResult;

  const result = octokit.repos.listReleases(args);
  await octoCache.setItem(cacheKey, result, { ttl: 360 });
  return result;
}

const calculateResult = async ({
  octokit,
  repoConf,
  suffixes,
}: {
  octokit: Octokit;
  repoConf: { owner: string; repo: string };
  suffixes?: string[];
}) => {
  const cacheKey = JSON.stringify({ repoConf, suffixes });
  const cachedResult = await resultCache.getItem<string>(cacheKey);
  if (cachedResult) return cachedResult;

  console.debug("calculating...");
  let releaseIds = new Set<number>();
  let page = 0;

  do {
    const newReleaseIds = (await fetchReleaseIDs(octokit, { ...repoConf, per_page: 30, page })
      
    ).data.map((release) => release.id);
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
  const now = new Date().getTime();
  console.debug(now);

  const ownerRepoInput = req.query.repo;
  let suffixes = req.query.suffix;
  if (typeof suffixes === "string") {
    suffixes = suffixes.split(",");
  }

  const repoConf = {
    owner: ownerRepoInput[0],
    repo: ownerRepoInput[1],
  };

  if (!repoConf.owner || !repoConf.repo) {
    return res
      .status(400)
      .json({ error: "repos have to be in OWNER/REPO syntax" });
  }

  const repoInfo = await octokit.repos.get(repoConf).catch((error) => {
    res.status(400).json({ error: error.response.data.message });
    return null;
  });

  if (!repoInfo) return;

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200);

  const total = await calculateResult({
    repoConf,
    octokit,
    suffixes,
  });
  res.json({ count: total });
}
