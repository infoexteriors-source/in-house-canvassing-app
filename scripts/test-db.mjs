import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const name=`we-roof-db-tests-${process.pid}`;
function run(args,input){const result=spawnSync('docker',args,{input,encoding:'utf8',stdio:input?['pipe','pipe','pipe']:'inherit',timeout:180000});if(result.status!==0)throw Error(result.stderr||`Docker command failed: ${args[0]}`);return result.stdout;}
try{
 run(['run','--platform','linux/amd64','--name',name,'--detach','--rm','-e','POSTGRES_PASSWORD=disposable-test-only','-e','POSTGRES_DB=weroof','postgis/postgis:17-3.5']);
 let ready=false;for(let i=0;i<40;i++){const check=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});if(check.status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}if(!ready)throw Error('Test database did not start.');
 const psql=['exec','-i',name,'psql','-U','postgres','-d','weroof','-v','ON_ERROR_STOP=1'];
 run(psql,readFileSync('supabase/tests/fixture.sql','utf8'));
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())run(psql,readFileSync(resolve('supabase/migrations',file),'utf8'));
 const output=run(psql,readFileSync('supabase/tests/integration.sql','utf8'));
 console.log(output.split('\n').filter(line=>line.includes('passed')).join('\n'));
}finally{spawnSync('docker',['stop',name],{stdio:'ignore'});}
