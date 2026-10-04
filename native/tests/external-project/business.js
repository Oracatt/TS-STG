import { RNG, Entity } from '@ts-stg/thlib';

// Consumer-owned business code, reached with a relative import.
export function createBusinessEntity() {
  const random=new RNG(123);
  if(!Number.isFinite(random.next()))throw new Error('External thlib RNG import failed');
  return new Entity({x:20,y:30,vx:2});
}
