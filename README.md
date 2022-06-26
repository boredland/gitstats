
# releases download count

![downloads](https://img.shields.io/badge/dynamic/json?color=green&label=manjaro-sway&cache=3600&query=count&url=https%3A%2F%2Freleases-count.manjaro-sway.download%2Freleases%3Fowner%3Dmanjaro-sway%26repo%3Dmanjaro-sway)

this is a webservice that returns the sum of downloads for all releases of a github repository.

## Example Request

```sh
curl -X GET https://releases-count.manjaro-sway.download/releases?owner={owner}&repo={repo}&suffixes={suffixes}
```

### API

- `owner`: the github owner of the repository (user or organization)
- `repo`: the github repository name
- `suffixes`: the suffixes of the releases to count, separated by commas (optional, will count only the file with the highest download count per release if not provided)
