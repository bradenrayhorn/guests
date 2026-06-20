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

      pkgs-unstable = import nixpkgs-unstable {
        inherit system;
        config.allowUnfree = true;
      };

      modules = [
        vzm-guest.nixosModules.base
        vzm-guest.nixosModules.braden
        home-manager.nixosModules.home-manager
        ./profile.nix
        ./modules/docker.nix
      ] ++ (if builtins.pathExists ./local.nix then [ ./local.nix ] else [ ]) ++ [
        ({ pkgs, ... }: {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.extraSpecialArgs = { inherit inputs pkgs-unstable; };
          home-manager.users.braden = import ./modules/home.nix;
        })
      ];
    in
    {
      nixosConfigurations.default = vzm-guest.lib.mkGuestSystem {
        inherit system modules;
      };

      packages.${system}.guest-bundle = vzm-guest.lib.mkGuestBundle {
        nixosConfiguration = self.nixosConfigurations.default;
      };
    };

}
