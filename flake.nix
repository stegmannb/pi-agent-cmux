{
  description = "pi-agent-cmux packaged as a Nix flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          package = pkgs.callPackage ./nix/package.nix { };
        in
        {
          default = package;
          policy-tools = pkgs.buildEnv {
            name = "repository-policy-tools";
            paths = [
              (pkgs.python3.withPackages (p: [ p.pyyaml ]))
              pkgs.ruff
            ];
          };

          pi-agent-cmux = package;
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);
    };
}
