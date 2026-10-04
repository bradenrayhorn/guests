{
  pkgs,
  inputs,
  lib,
  osConfig,
  ...
}:

let
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
      fugitive = plugin "fugitive" pkgs.vimPlugins.vim-fugitive;
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
        go
        vscode-langservers-extracted
        css-variables-language-server
        nil
        eslint
        gopls
        svelte-language-server
        vtsls
        ripgrep
      ]
      ++ lib.optionals osConfig.profiles.jvm.enable [
        kmp-lsp
        # Used by KMP LSP and Gradle project import.
        jdk21
        fd
        # Provides systemd-run for the KMP LSP's CPU-limited user scope.
        systemd
      ];
  };
in
{
  programs.neovim.enable = false;
  home.packages = [ dev-neovim ];
}
