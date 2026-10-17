import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {GET} from '../src/pages/media/articles/[filename].js';

test('article images use the adjacent directory and reject traversal and symlinks',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'article-media-'));
  const previous=process.env.MEDIA_UPLOAD_DIR;
  process.env.MEDIA_UPLOAD_DIR=path.join(directory,'sponsors');
  const filename='a'.repeat(64)+'.png';
  const request=(filename:string,method='GET')=>GET({params:{filename},request:new Request('http://localhost/media/articles/'+filename,{method})} as never);
  try {
    await mkdir(path.join(directory,'articles'));
    await writeFile(path.join(directory,'articles',filename),'image bytes');
    const image=await request(filename);assert.equal(image.status,200);assert.equal(await image.text(),'image bytes');
    const head=await request(filename,'HEAD');assert.equal(head.headers.get('content-type'),'image/png');assert.equal(await head.text(),'');
    await symlink(path.join(directory,'articles',filename),path.join(directory,'articles','b'.repeat(64)+'.png'));
    for(const name of ['../'+filename,'b'.repeat(64)+'.png','c'.repeat(64)+'.svg','missing.png']) assert.equal((await request(name)).status,404);
  } finally {
    if(previous===undefined)delete process.env.MEDIA_UPLOAD_DIR;else process.env.MEDIA_UPLOAD_DIR=previous;
    await rm(directory,{recursive:true,force:true});
  }
});
