vim.cmd.packadd("conform.nvim")

require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		nix = { "nixfmt" },
		json = { "prettierd" },
		jsonc = { "prettierd" },
		javascript = { "prettierd" },
		typescript = { "prettierd" },
		typescriptreact = { "prettierd" },
		svelte = { "prettierd" },
		html = { "prettierd" },
		css = { "prettierd" },
	},
	format_on_save = {
		timeout_ms = 500,
		lsp_fallback = false,
	},
})
