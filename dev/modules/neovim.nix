{ pkgs, inputs, lib, osConfig, ... }:

let
  kotlin-lsp = pkgs.stdenv.mkDerivation rec {
    pname = "kotlin-lsp";
    version = "261.13587.0";

    src = pkgs.fetchzip {
      url = "https://download-cdn.jetbrains.com/kotlin-lsp/${version}/kotlin-lsp-${version}-linux-aarch64.zip";
      hash = "sha256-MhHEYHBctaDH9JVkN/guDCG1if9Bip1aP3n+JkvHCvA=";
      stripRoot = false;
    };

    nativeBuildInputs = [
      pkgs.autoPatchelfHook
      pkgs.makeWrapper
    ];

    buildInputs = [
      pkgs.jdk21
      pkgs.alsa-lib
      pkgs.freetype
      pkgs.libgcc.lib
      pkgs.libx11
      pkgs.libxi
      pkgs.libxrender
      pkgs.libxtst
      pkgs.wayland
      pkgs.zlib
    ];

    dontConfigure = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall

      # 1. Setup directories
      mkdir -p $out/lib/kotlin-lsp $out/bin
      cp -r * $out/lib/kotlin-lsp

      # 2. Symlink the Nix JDK to 'jre'
      #    We replace the bundled JRE with a link to the system JDK.
      rm -rf $out/lib/kotlin-lsp/jre
      ln -s ${pkgs.jdk21}/lib/openjdk $out/lib/kotlin-lsp/jre

      # 3. Patch the startup script
      #    Stop it from trying to 'chmod' the read-only java binary.
      substituteInPlace $out/lib/kotlin-lsp/kotlin-lsp.sh \
        --replace 'chmod +x' '# chmod +x'

      # 4. Make the startup script executable (Crucial Step!)
      chmod +x $out/lib/kotlin-lsp/kotlin-lsp.sh

      # 5. Create the wrapper
      #    We use makeWrapper to create a binary in $out/bin that calls the script in $out/lib.
      #    We also inject the PATH and JAVA_HOME here.
      makeWrapper $out/lib/kotlin-lsp/kotlin-lsp.sh $out/bin/kotlin-lsp \
        --set JAVA_HOME "${pkgs.jdk21}/lib/openjdk" \
        --prefix PATH : ${
          pkgs.lib.makeBinPath [
            pkgs.jdk17
            pkgs.jdk21
            pkgs.coreutils
            pkgs.bash
            pkgs.git
          ]
        }

      runHook postInstall
    '';
  };

  parser = parsers: name: parsers.${name} or parsers.${"tree-sitter-${name}"};

  treesitter = pkgs.vimPlugins.nvim-treesitter.withPlugins (
    parsers:
    map (parser parsers) (
      [
        # this config
        "vim"
        "vimdoc"
        "lua"
        "nix"
        # go
        "go"
        "gomod"
        # web
        "typescript"
        "svelte"
        "javascript"
        "css"
        "html"
        "tsx"
        # general
        "bash"
        "json"
        "toml"
        "yaml"
        "csv"
        "dockerfile"
        "proto"
        "regex"
        # iac
        "helm"
        "terraform"
      ]
      ++ lib.optionals osConfig.profiles.jvm.enable [
        "kotlin"
      ]
    )
  );

  plugin = pname: data: {
    inherit pname data;
    lazy = true;
    autoconfig = false;
  };

  dev-neovim = inputs.nix-wrapper-modules.wrappers.neovim.wrap {
    inherit pkgs;

    settings.config_directory = ./nvim;

    info = {
      profiles = {
        jvm = osConfig.profiles.jvm.enable;
      };
    };

    specs = {
      oil = plugin "oil.nvim" pkgs.vimPlugins.oil-nvim;
      snacks = plugin "snacks-nvim" pkgs.vimPlugins.snacks-nvim;
      gruvbox = plugin "gruvbox" pkgs.vimPlugins.gruvbox;
      conform = plugin "conform.nvim" pkgs.vimPlugins.conform-nvim;
      treesitter = plugin "nvim-treesitter" treesitter;
      autopairs = plugin "nvim-autopairs" pkgs.vimPlugins.nvim-autopairs;
      commentary = plugin "vim-commentary" pkgs.vimPlugins.vim-commentary;
      surround = plugin "vim-surround" pkgs.vimPlugins.vim-surround;
      arrow = plugin "arrow-nvim" pkgs.vimPlugins.arrow-nvim;
      lspconfig = plugin "nvim-lspconfig" pkgs.vimPlugins.nvim-lspconfig;
      blinkcmp = plugin "blink-cmp" pkgs.vimPlugins.blink-cmp;
    };

    runtimePkgs =
      with pkgs;
      [
        tree-sitter

        # formatters
        stylua
        nixfmt
        prettierd

        # lsp
        nil
        eslint
        gopls
        svelte-language-server
        vtsls
      ]
      ++ lib.optionals osConfig.profiles.jvm.enable [
        kotlin-lsp
      ];
  };
in
{
  programs.neovim.enable = false;
  home.packages = [ dev-neovim ];
}
