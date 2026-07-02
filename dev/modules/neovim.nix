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
      pkgs.makeWrapper
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

      makeWrapper $out/lib/kotlin-lsp/bin/intellij-server $out/bin/intellij-server \
        --prefix PATH : ${
          pkgs.lib.makeBinPath [
            pkgs.coreutils
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
