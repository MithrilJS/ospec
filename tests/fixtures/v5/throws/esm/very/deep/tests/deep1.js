
"use strict"
console.log(import.meta.url.slice(7) + " ran")
throw import.meta.url.slice(7) + " threw"
