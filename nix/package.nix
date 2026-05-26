{
  stdenv,
  lib,
  nodejs,
  pnpm,
  pnpmConfigHook,
  fetchPnpmDeps,
  jq,
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ../package.json);
in
stdenv.mkDerivation (finalAttrs: {
  pname = packageJson.name;
  version = packageJson.version;

  src = lib.cleanSource ../.;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 3;
    hash = "sha256-y42CfAtTL7u6TEMzgYxf9mS06vLDdqJQSwitkR+FmV4=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    jq
  ];

  # No runtime npm dependencies — only install devDeps for the type-check
  # during development. The derivation itself only needs to copy sources.
  prePnpmInstall = ''
    pnpmInstallFlags+=(--prod)
  '';

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out"
    cp -r src "$out/"
    cp -r skills "$out/"
    cp package.json "$out/"

    runHook postInstall
  '';

  postInstall = ''
    mkdir -p "$out/cmux"
    echo 'export { default } from "../src/index.ts";' > "$out/cmux/index.ts"

    jq '.pi.extensions = ["./cmux/index.ts"]' "$out/package.json" > "$out/package.json.tmp"
    mv "$out/package.json.tmp" "$out/package.json"
  '';

  meta = {
    description = packageJson.description;
    homepage = packageJson.homepage;
    license = lib.licenses.mit;
    maintainers = [ ];
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
