vim.cmd.packadd("nvim-treesitter")

local nix = require("nix")

local ft_to_lang = {
	sh = "bash",
	bash = "bash",
	help = "vimdoc",
}

local patterns = {
	-- vim
	"vim",
	"help",
	"lua",
	"nix",
	-- go
	"go",
	"gomod",
	-- web
	"typescript",
	"svelte",
	"javascript",
	"css",
	"html",
	"tsx",
	-- general
	"sh",
	"bash",
	"json",
	"toml",
	"yaml",
	"csv",
	"dockerfile",
	"proto",
	"regex",
	-- iac
	"helm",
	"terraform",
}

if nix.jvm_enabled() then
	table.insert(patterns, "kotlin")
end

vim.api.nvim_create_autocmd("FileType", {
	pattern = patterns,
	callback = function(ev)
		local ft = vim.bo[ev.buf].filetype
		local lang = ft_to_lang[ft] or vim.treesitter.language.get_lang(ft) or ft

		pcall(vim.treesitter.start, ev.buf, lang)

		-- Optional indentation/folding
		--vim.bo[ev.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
		--vim.wo.foldmethod = "expr"
		--vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"
	end,
})
