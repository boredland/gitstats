type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}${"" extends P ? "" : "."}${P}`
    : never
  : never;

type Prev = [never, 0, 1, 2, 3, 4];

type Paths<T, D extends number = 4> = [D] extends [never]
  ? never
  : T extends object
  ? {
      [K in keyof T]-?: K extends string | number
        ? `${K}` | Join<K, Paths<T[K], Prev[D]>>
        : never;
    }[keyof T]
  : "";

const getShield = <T>(url: string, key: Paths<T>, label: string): string => {
  return `https://img.shields.io/badge/dynamic/json?color=green&label=${label}&cache=3600&query=${key}&url=${encodeURIComponent(
    url
  )}`;
};

export default getShield;
