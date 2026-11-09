vim.cmd.packadd("conform.nvim")

local function format_opts(bufnr)
	local filetype = vim.bo[bufnr].filetype
	-- mix format loads the project's formatter plugins, so the first format of a
	-- session is much slower than the other formatters.
	local is_elixir = filetype == "elixir" or filetype == "eelixir" or filetype == "heex"
	return { timeout_ms = is_elixir and 5000 or 500, lsp_fallback = false }
end

require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		nix = { "nixfmt" },
		elixir = { "mix" },
		eelixir = { "mix" },
		heex = { "mix" },
		json = { "prettierd" },
		jsonc = { "prettierd" },
		javascript = { "prettierd" },
		typescript = { "prettierd" },
		typescriptreact = { "prettierd" },
		svelte = { "prettierd" },
		html = { "prettierd" },
		css = { "prettierd" },
	},
	format_on_save = format_opts,
})
