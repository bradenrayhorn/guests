vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- open file navigation
vim.keymap.set("n", "<leader>pv", "<CMD>Oil<CR>")

-- save to disk
vim.keymap.set("n", "<leader>w", vim.cmd.w)

-- shift-J and shift-K on highlighted line to move them up or down
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv")

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.signcolumn = "yes"

vim.opt.autoindent = true
vim.opt.smartindent = true

vim.opt_local.shiftwidth = 4
vim.opt_local.tabstop = 4
vim.opt_local.softtabstop = 4
vim.opt_local.expandtab = true

vim.api.nvim_create_autocmd("FileType", {
	pattern = "rust,groovy",
	callback = function()
		vim.opt_local.shiftwidth = 4
		vim.opt_local.tabstop = 4
		vim.opt_local.softtabstop = 4
		vim.opt_local.expandtab = true
	end,
})

vim.api.nvim_create_autocmd("FileType", {
	pattern = "go",
	callback = function()
		vim.opt_local.shiftwidth = 4
		vim.opt_local.tabstop = 4
		vim.opt_local.softtabstop = 4
		vim.opt_local.expandtab = false
	end,
})

vim.api.nvim_create_autocmd("FileType", {
	pattern = "typescriptreact,typescript,javascript,html,terraform,svelte,json,css,proto,nix",
	callback = function()
		vim.opt_local.shiftwidth = 2
		vim.opt_local.tabstop = 2
		vim.opt_local.softtabstop = 2
		vim.opt_local.expandtab = true
	end,
})

vim.filetype.add({
	extension = {
		postcss = "css",
	},
})

vim.opt.hlsearch = false
vim.opt.incsearch = true

vim.opt.scrolloff = 8
vim.opt.termguicolors = true

vim.opt.wrap = false

vim.opt.updatetime = 250

vim.opt.colorcolumn = "100"

vim.opt.statusline = "%f %h%w%m%r%=%-14.(%l,%c%V%) %y %P"

-- diff

vim.opt.fillchars = {
	diff = "╱",
}

vim.opt.diffopt = {
	"internal",
	"filler",
	"closeoff",
	"context:12",
	"algorithm:histogram",
	"linematch:200",
	"indent-heuristic",
}
