{
  stdenv,
  lib,
  nodejs,
  pnpm,
  pnpmConfigHook,
  fetchPnpmDeps,
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ../package.json);
in
stdenv.mkDerivation (finalAttrs: {
  pname = packageJson.name;
  version = packageJson.version;

  src = lib.cleanSourceWith {
    src = lib.cleanSource ../.;
    filter =
      path: _type:
      !(lib.hasInfix "/node_modules/" path) && !(lib.hasSuffix "/node_modules" path);
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 2;
    hash = "sha256-i6TwJhTn4tVAPT+kJwbwuM8UT0/rQEvzlo6HWA7NHFA=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
  ];

  # No runtime npm dependencies — only install devDeps for the type-check
  # during development. The derivation itself only needs to copy sources.
  prePnpmInstall = ''
    pnpmInstallFlags+=(--prod)
  '';

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/pi-cmux"
    cp -r src "$out/pi-cmux/"
    cp -r skills "$out/pi-cmux/"
    cp package.json "$out/pi-cmux/"

    # Root entry point expected by pi at $out/pi-cmux/index.ts
    cat > "$out/pi-cmux/index.ts" <<'EOF'
export { default } from "./src/index.ts";
EOF

    runHook postInstall
  '';

  meta = {
    description = packageJson.description;
    homepage = packageJson.homepage;
    license = lib.licenses.mit;
    maintainers = [ ];
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
