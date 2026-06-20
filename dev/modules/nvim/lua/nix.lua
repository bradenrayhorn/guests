local M = {}

local function get_nix_info()
	local plugin_name = vim.g.nix_info_plugin_name
	if not plugin_name then
		return function(default)
			return default
		end
	end

	local ok, nix_info = pcall(require, plugin_name)
	if not ok then
		return function(default)
			return default
		end
	end

	return nix_info
end

local nix_info = get_nix_info()

function M.get(default, ...)
	return nix_info(default, ...)
end

function M.jvm_enabled()
	return M.get(false, "info", "profiles", "jvm")
end

return M
