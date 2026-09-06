// Remove long printed table rules before OCR. This operates on a temporary
// raster; the uploaded document and evidence preview are never modified.
export function cleanTableImage(image) {
  const { width, height, data } = image
  const dark = new Uint8Array(width * height)
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < dark.length; i++) dark[i] = (data[i*4] + data[i*4+1] + data[i*4+2]) / 3 < 145 ? 1 : 0
  for (let y=0; y<height; y++) {
    let start=-1
    for (let x=0; x<=width; x++) {
      if (x<width && dark[y*width+x]) { if(start<0) start=x }
      else if(start>=0) {
        if(x-start>width*0.035) for(let yy=Math.max(0,y-2); yy<=Math.min(height-1,y+2); yy++) for(let xx=start; xx<x; xx++) mask[yy*width+xx]=1
        start=-1
      }
    }
  }
  for (let x=0; x<width; x++) {
    let start=-1
    for (let y=0; y<=height; y++) {
      if(y<height && dark[y*width+x]) { if(start<0) start=y }
      else if(start>=0) {
        if(y-start>height*0.025) for(let xx=Math.max(0,x-2); xx<=Math.min(width-1,x+2); xx++) for(let yy=start; yy<y; yy++) mask[yy*width+xx]=1
        start=-1
      }
    }
  }
  for(let i=0; i<dark.length; i++) {
    const value=dark[i] && !mask[i] ? 0 : 255
    data[i*4]=data[i*4+1]=data[i*4+2]=value
    data[i*4+3]=255
  }
  return image
}
