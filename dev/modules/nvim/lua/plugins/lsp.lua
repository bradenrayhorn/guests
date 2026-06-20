vim.cmd.packadd("nvim-lspconfig")
vim.cmd.packadd("blink-cmp")

local nix = require("nix")

require("blink-cmp").setup({
	keymap = { preset = "enter" },
})

-- setup lsp

vim.lsp.config("nil_ls", {
	nix = {
		autoArchive = false,
	},
})
vim.lsp.enable("nil_ls")
vim.lsp.enable("gopls")

vim.lsp.config("css_variables", {
	filetypes = { "css", "svelte" },
})
vim.lsp.config("tailwindcss", {
	root_dir = function(fname)
		local root_pattern = require("lspconfig").util.root_pattern("tailwind.config.js", "tailwind.config.ts")
		return root_pattern(fname)
	end,
})
vim.lsp.config("vtsls", {
	filetypes = { "typescript", "typescriptreact", "svelte" },
	settings = {
		typescript = {
			preferences = {
				includePackageJsonAutoImports = "on",
			},
		},
	},
})
vim.lsp.enable("vtsls")
vim.lsp.enable("eslint")
vim.lsp.enable("svelte")
vim.lsp.enable("cssls")
vim.lsp.enable("css_variables")

if nix.jvm_enabled() then
	vim.lsp.enable("kotlin_lsp")
end

-- key map and other lsp config

vim.keymap.set("n", "gl", "<cmd>lua vim.diagnostic.open_float()<cr>")
vim.keymap.set("n", "[d", "<cmd>lua vim.diagnostic.jump({count=-1, float=true})<cr>")
vim.keymap.set("n", "]d", "<cmd>lua vim.diagnostic.jump({count=1, float=true})<cr>")

vim.api.nvim_create_autocmd("LspAttach", {
	desc = "LSP actions",
	callback = function(event)
		local opts = { buffer = event.buf }
		local client = vim.lsp.get_client_by_id(event.data.client_id)

		-- workaround to make svelte ls reload changes from ts files
		-- https://github.com/sveltejs/language-tools/issues/2008
		if client ~= nil and client.name == "svelte" then
			vim.api.nvim_create_autocmd("BufWritePost", {
				pattern = { "*.js", "*.ts" },
				group = vim.api.nvim_create_augroup("svelte_ondidchangetsorjsfile", { clear = true }),
				callback = function(ctx)
					-- Here use ctx.match instead of ctx.file
					client.notify("$/onDidChangeTsOrJsFile", { uri = ctx.match })
				end,
			})
		end

		vim.keymap.set(
			"n",
			"<leader>oi",
			"<cmd>lua "
				.. 'vim.lsp.buf.execute_command({command = "_typescript.organizeImports", arguments = {vim.fn.expand("%:p")}})'
				.. 'vim.lsp.buf.code_action{ context = { only = { "source.organizeImports" } }, apply = true } '
				.. "<cr>",
			opts
		)

		-- these will be buffer-local keybindings
		-- because they only work if you have an active language server

		vim.keymap.set("n", "K", "<cmd>lua vim.lsp.buf.hover()<cr>", opts)
		vim.keymap.set("n", "gd", "<cmd>lua vim.lsp.buf.definition()<cr>", opts)
		vim.keymap.set("n", "gD", "<cmd>lua vim.lsp.buf.declaration()<cr>", opts)
		vim.keymap.set("n", "gi", "<cmd>lua vim.lsp.buf.implementation()<cr>", opts)
		vim.keymap.set("n", "go", "<cmd>lua vim.lsp.buf.type_definition()<cr>", opts)
		vim.keymap.set("n", "gr", "<cmd>lua vim.lsp.buf.references()<cr>", opts)
		vim.keymap.set("n", "gs", "<cmd>lua vim.lsp.buf.signature_help()<cr>", opts)
		vim.keymap.set("n", "<leader>r", "<cmd>lua vim.lsp.buf.rename()<cr>", opts)
		vim.keymap.set("n", "ca", "<cmd>lua vim.lsp.buf.code_action()<cr>", opts)
	end,
})

for _, method in ipairs({ "textDocument/diagnostic", "workspace/diagnostic" }) do
	local default_diagnostic_handler = vim.lsp.handlers[method]
	vim.lsp.handlers[method] = function(err, result, context, config)
		if err ~= nil and err.code == -32802 then
			return
		end
		return default_diagnostic_handler(err, result, context, config)
	end
end
