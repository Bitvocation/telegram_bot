"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSLATIONS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.TRANSLATIONS = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, "translations.json"), "utf8"));
