// Parses the `window.__NUXT__=(function(a,b,...){...}(arg1,arg2,...))` blob
// that Nuxt 2 embeds in server-rendered pages, WITHOUT executing it.
// It returns the function body (as text) plus a resolver that maps the
// minified parameter names (a, b, fp, ...) to their literal argument values.

export type NuxtValue = string | number | boolean | null | undefined;

export interface NuxtBlob {
  body: string;
  resolve(token: string): NuxtValue;
}

export function parseNuxt(html: string): NuxtBlob {
  const start = html.indexOf("window.__NUXT__=(function(");
  if (start < 0) throw new Error("__NUXT__ blob niet gevonden");
  const paramsStart = start + "window.__NUXT__=(function(".length;
  const paramsEnd = html.indexOf(")", paramsStart);
  const params = html.slice(paramsStart, paramsEnd).split(",").map((p) => p.trim());

  if (html[paramsEnd + 1] !== "{") throw new Error("Onverwachte __NUXT__ opbouw");
  const bodyStart = paramsEnd + 2;
  const bodyEnd = findClosingBrace(html, bodyStart);
  const body = html.slice(bodyStart, bodyEnd);

  if (html[bodyEnd + 1] !== "(") throw new Error("__NUXT__ argumenten niet gevonden");
  const args = parseArgs(html, bodyEnd + 2);

  const vars = new Map<string, NuxtValue>();
  params.forEach((name, i) => vars.set(name, args[i]));

  return {
    body,
    resolve(token: string): NuxtValue {
      return resolveToken(token, vars);
    },
  };
}

// Returns index of the `}` that closes the block starting at `from` (depth 1).
function findClosingBrace(s: string, from: number): number {
  let depth = 1;
  for (let i = from; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34 /* " */ || c === 39 /* ' */) {
      i = skipString(s, i);
    } else if (c === 123 /* { */) {
      depth++;
    } else if (c === 125 /* } */) {
      if (--depth === 0) return i;
    }
  }
  throw new Error("Einde van __NUXT__ body niet gevonden");
}

// i points at the opening quote; returns the index of the closing quote.
function skipString(s: string, i: number): number {
  const quote = s[i];
  for (let j = i + 1; j < s.length; j++) {
    const ch = s[j];
    if (ch === "\\") j++;
    else if (ch === quote) return j;
  }
  throw new Error("Onafgesloten string in __NUXT__");
}

function parseArgs(s: string, from: number): NuxtValue[] {
  const out: NuxtValue[] = [];
  let i = from;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ")") return out;
    if (ch === "," || ch === " " || ch === "\n") {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = skipString(s, i);
      out.push(unescapeJs(s.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    // Raw token: read until a top-level `,` or `)`.
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '"' || c === "'") j = skipString(s, j);
      else if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) break;
    }
    out.push(literal(s.slice(i, j).trim()));
    i = j;
  }
  throw new Error("Einde van __NUXT__ argumenten niet gevonden");
}

function literal(raw: string): NuxtValue {
  if (raw === "true" || raw === "!0") return true;
  if (raw === "false" || raw === "!1") return false;
  if (raw === "null") return null;
  if (raw === "void 0" || raw === "undefined") return undefined;
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) return Number(raw);
  return undefined; // objects/arrays like Array(1) or {} — not needed
}

function resolveToken(token: string, vars: Map<string, NuxtValue>): NuxtValue {
  const t = token.trim();
  if (t.startsWith('"') || t.startsWith("'")) return unescapeJs(t.slice(1, -1));
  if (/^[A-Za-z_$][\w$]*$/.test(t) && vars.has(t)) return vars.get(t);
  return literal(t);
}

export function unescapeJs(s: string): string {
  if (!s.includes("\\")) return s;
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e: string) => {
    if (e[0] === "u") {
      const hex = e[1] === "{" ? e.slice(2, -1) : e.slice(1);
      return String.fromCodePoint(parseInt(hex, 16));
    }
    if (e[0] === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    switch (e) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0": return "\0";
      default: return e; // \" \' \\ \/ etc.
    }
  });
}
