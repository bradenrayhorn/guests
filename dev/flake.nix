{
  description = "dev machine";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixos-unstable";

    vzm-guest = {
      url = "github:bradenrayhorn/vzm?dir=guest";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    home-manager = {
      url = "github:nix-community/home-manager/release-26.05";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nix-wrapper-modules = {
      url = "github:BirdeeHub/nix-wrapper-modules";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-unstable,
      vzm-guest,
      home-manager,
      ...
    }@inputs:
    let
      system = "aarch64-linux";
    in
    {
      nixosModules.default =
        { pkgs, ... }:
        let
          pkgs-unstable = import nixpkgs-unstable {
            system = pkgs.stdenv.hostPlatform.system;
            config.allowUnfree = true;
          };
        in
        {
          imports = [
            vzm-guest.nixosModules.base
            vzm-guest.nixosModules.braden
            home-manager.nixosModules.home-manager
            ./profile.nix
            ./nixos/envs.nix
            ./nixos/docker.nix
            ./nixos/persist.nix
            ({ config, lib, ... }: lib.mkIf config.profiles.jvm.enable {
              vzm.proxy.java.enable = true;
            })
          ];

          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.extraSpecialArgs = { inherit inputs pkgs-unstable; };
          home-manager.users.braden.imports = [ ./home/default.nix ];
        };

      nixosModules.dev = self.nixosModules.default;

      lib = {
        mkDevGuestSystem =
          { system ? "aarch64-linux", modules ? [ ] }:
          vzm-guest.lib.mkGuestSystem {
            inherit system;
            modules = [ self.nixosModules.default ] ++ modules;
          };

        mkGuestBundle = vzm-guest.lib.mkGuestBundle;
      };

      nixosConfigurations.default = self.lib.mkDevGuestSystem {
        inherit system;
        modules = if builtins.pathExists ./local.nix then [ ./local.nix ] else [ ];
      };

      packages.${system}.guest-bundle = self.lib.mkGuestBundle {
        nixosConfiguration = self.nixosConfigurations.default;
      };
    };

}
