import {registerHooks} from 'node:module'
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.js'))return next(`${s}.js`,c);throw e}}})
for(const path of ['test-coach','test-pushup','test-plank','test-reverse-crunch','test-twist-activity','test-upper-body']) {
  await import(`./${path}.mjs`)
}
console.log('PASS all six detector/history regression scripts')
