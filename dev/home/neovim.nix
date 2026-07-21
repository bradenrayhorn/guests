{
  pkgs,
  inputs,
  lib,
  osConfig,
  ...
}:

let
  kotlin-lsp = pkgs.stdenv.mkDerivation rec {
    pname = "intellij-server";
    version = "262.8190.0";

    src = pkgs.fetchzip {
      url = "https://download-cdn.jetbrains.com/language-server/kotlin-server/${version}/kotlin-server-${version}-aarch64.tar.gz";
      hash = "sha256-SZ/Fjoe5fz8G7OBiTlRKwD8cVLrc674ptSYJ9T/XWic=";
    };

    nativeBuildInputs = [
      pkgs.autoPatchelfHook
    ];

    buildInputs = [
      pkgs.alsa-lib
      pkgs.freetype
      pkgs.libgcc.lib
      pkgs.libx11
      pkgs.libxi
      pkgs.libxrender
      pkgs.libxtst
      pkgs.libxkbcommon
      pkgs.wayland
      pkgs.zlib
    ];

    dontConfigure = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall

      mkdir -p $out/lib/kotlin-lsp $out/bin
      cp -r . $out/lib/kotlin-lsp
      chmod +x $out/lib/kotlin-lsp/bin/intellij-server

      cat > $out/bin/intellij-server <<EOF
      #!${pkgs.runtimeShell}
      set -euo pipefail

      kotlin_lsp_home="\''${KOTLIN_LSP_HOME:-\''${XDG_DATA_HOME:-\$HOME/.local/share}/kotlin-lsp}"
      mkdir -p "\$kotlin_lsp_home"/{config,system,plugins,log}

      # The JetBrains launcher falls back to /tmp idea-system dirs in this Nix
      # package unless we provide writable persistent paths.  Keep all IntelliJ
      # state under one base directory and pass it via JetBrains' stable
      # idea.properties mechanism instead of baking every path into JVM args.
      cat > "\$kotlin_lsp_home/idea.properties" <<PROPS
      idea.config.path=\$kotlin_lsp_home/config
      idea.system.path=\$kotlin_lsp_home/system
      idea.plugins.path=\$kotlin_lsp_home/plugins
      idea.log.path=\$kotlin_lsp_home/log
      PROPS

      export JAVA_HOME="\''${JAVA_HOME:-${pkgs.jdk21}}"
      export IJ_JAVA_OPTIONS="\''${IJ_JAVA_OPTIONS:-} -Didea.properties.file=\$kotlin_lsp_home/idea.properties -Dcom.jetbrains.ls.imports.gradle.java.home=\$JAVA_HOME"
      export PATH="${
        pkgs.lib.makeBinPath [
          pkgs.coreutils
          pkgs.git
          pkgs.jdk21
        ]
      }\''${PATH:+:\$PATH}"

      exec $out/lib/kotlin-lsp/bin/intellij-server "\$@"
      EOF
      chmod +x $out/bin/intellij-server

      runHook postInstall
    '';
  };

  kmp-lsp = pkgs.stdenv.mkDerivation {
    pname = "kmp-lsp";
    version = "0.24.0";

    src = pkgs.fetchurl {
      url = "https://github.com/Hessesian/kmp-lsp/releases/download/v0.24.0/kmp-lsp-linux-aarch64.tar.gz";
      hash = "sha256-RBnyI26zadrimRUBIspt1Az3LiZrkAHYkXL2QWHkR5k=";
    };

    # The release archive contains files at its root instead of a single
    # top-level directory, so the generic unpacker cannot infer sourceRoot.
    sourceRoot = ".";

    nativeBuildInputs = [ pkgs.autoPatchelfHook ];
    buildInputs = [
      pkgs.libgcc.lib
      pkgs.zlib
    ];

    dontConfigure = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall
      mkdir -p $out/bin
      # kmp-lsp finds the native indexer next to its own executable.  Keep
      # both files in one directory (rather than wrapping either executable).
      install -m755 kmp-lsp kmp-jar-indexer $out/bin/
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
        ripgrep
      ]
      ++ lib.optionals osConfig.profiles.jvm.enable [
        kotlin-lsp
        kmp-lsp
        # Used by the Kotlin LSP launcher and Gradle project import.
        jdk21
        # KMP LSP uses both tools for fast workspace discovery/search.
        fd
      ];
  };
in
{
  programs.neovim.enable = false;
  home.packages = [ dev-neovim ];
}
