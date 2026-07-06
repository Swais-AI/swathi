const APP_BASE_PATH = "";

export function withBasePath(path) {
  if (!APP_BASE_PATH || /^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath === "/" ? APP_BASE_PATH : `${APP_BASE_PATH}${normalizedPath}`;
}

export function withoutBasePath(pathname) {
  if (!APP_BASE_PATH || !pathname.startsWith(APP_BASE_PATH)) {
    return pathname;
  }

  const strippedPath = pathname.slice(APP_BASE_PATH.length);
  return strippedPath || "/";
}
