{
  description = "Tritonize - A SolidJS image processing application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_20
            bun
            git
            lefthook
            gh
          ];

          shellHook = ''
            echo "🚀 Tritonize development environment loaded!"
            echo "📦 Node.js: $(node --version)"
            echo "🥖 Bun: $(bun --version)"
            echo "Available commands:"
            echo "  bun dev     - Start development server"
            echo "  bun build   - Build for production"
            echo "  bun format  - Format code with Prettier"
          '';
        };

        packages.default = pkgs.stdenv.mkDerivation {
          pname = "tritonize";
          version = "0.1.0";
          
          src = ./.;
          
          buildInputs = with pkgs; [
            nodejs_20
            bun
          ];
          
          buildPhase = ''
            export HOME=$TMPDIR
            bun install --frozen-lockfile
            bun run build
          '';
          
          installPhase = ''
            mkdir -p $out/share/tritonize
            cp -r build/* $out/share/tritonize/
          '';
        };
      });
}