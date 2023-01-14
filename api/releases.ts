// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { VercelRequest, VercelResponse } from "@vercel/node";
import github from "../utils/github";
import { withCacheFactory, CacheContainer } from '@ioki/node-ts-cache'
import { IoRedisStorage } from '@ioki/node-ts-cache-storage-ioredis'
import { Redis } from "ioredis";

const ioredis = new Redis(process.env.REDIS_URL as string)
const cache = new CacheContainer(new IoRedisStorage(ioredis))

const octokit = github;

const numberFormat = new Intl.NumberFormat("en-US");

const fetchReleaseIDs = withCacheFactory(cache)(async (args: {
  owner: string;
  repo: string;
  per_page: number;
  page: number | undefined;
}) => {
  const result: number[] = (await octokit.repos.listReleases(args)).data.map((release) => release.id);
  return result;
}, { ttl: 120000 });

const calculateResult = withCacheFactory(cache)(async ({
  repoConf,
  suffixes,
}: {
  repoConf: { owner: string; repo: string };
  suffixes?: string[];
}) => {
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
  return result;
}, { ttl: 120000 });

type GetRepoQuery = {
  owner: string;
  repo: string;
  created_at: string;
};
const getRepo = withCacheFactory(cache)(async (args: { owner: string; repo: string }) => {
  const result: GetRepoQuery | undefined = (await octokit.repos
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

  return result;
}, { ttl: 120000 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  const parameters = req.query as { owner: string, repo: string, suffix: string };
  const input = { ...parameters, suffix: parameters.suffix ? parameters.suffix.split(',') : undefined };

  console.debug(input);

  if (!input.owner || !input.repo) {
    res.status(400);
    return res.json({ error: "repo and owner are required"});
  }

  const repoConf = {
    owner: input.owner,
    repo: input.repo,
  };

  const repoInfo = await getRepo(repoConf);

  if (!repoInfo) return;

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200);

  const total = await calculateResult({
    repoConf,
    suffixes: input.suffix,
  });

  const result = {
    count: total,
  }

  res.json(result);
}
