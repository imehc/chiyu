"use strict";(self.webpackChunkanch=self.webpackChunkanch||[]).push([["3962"],{54567(t,e,n){n.d(e,{A:()=>s});var a=n(91987),i=n(71763),r=n(27112),o=n(82044),l=n(40878);let s=(0,i.forwardRef)(({children:t,loadingText:e="Initializing...",showLoading:n=!0,useFixedWrapper:s=!0,...u},c)=>{let h=(0,i.useRef)(null),[v,d]=(0,r.A)(h),f=(0,i.useCallback)(t=>{h.current=t,"function"==typeof c?c(t):c&&(c.current=t)},[c]),m="function"==typeof t,g={width:v,height:d},x=()=>m?t?.(g):t;return(0,a.jsx)(o.A,{ref:f,...u,children:v>0&&d>0?s?(0,a.jsx)("div",{className:"tw:absolute tw:top-0 tw:left-0 tw:overflow-hidden",style:{width:v,height:d},children:x()}):x():n?(0,a.jsx)(l.A,{loadText:e}):null})})},27112(t,e,n){n.d(e,{A:()=>i});var a=n(71763);function i(t){let[e,n]=(0,a.useState)([0,0]);return(0,a.useEffect)(()=>{let e=()=>{if(t.current){let{width:e,height:a}=t.current.getBoundingClientRect();n([e,a])}};e();let a=new ResizeObserver(e);return t.current&&a.observe(t.current),()=>{a.disconnect()}},[t]),e}},43041(t,e,n){n.r(e),n.d(e,{default:()=>g});var a=n(91987),i=n(54567),r=n(27112),o=n(18031),l=n(44393),s=n(71763),u=n(68085);let c={vertexShader:`
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        #define PI 3.141592653589793
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec2 sunPosition;
        uniform vec2 globeRotation;
        varying vec3 vNormal;
        varying vec2 vUv;

        float toRad(in float a) {
          return a * PI / 180.0;
        }

        vec3 Polar2Cartesian(in vec2 c) { // [lng, lat]
          float theta = toRad(90.0 - c.x);
          float phi = toRad(90.0 - c.y);
          return vec3( // x,y,z
            sin(phi) * cos(theta),
            cos(phi),
            sin(phi) * sin(theta)
          );
        }

        void main() {
          float invLon = toRad(globeRotation.x);
          float invLat = -toRad(globeRotation.y);
          mat3 rotX = mat3(
            1, 0, 0,
            0, cos(invLat), -sin(invLat),
            0, sin(invLat), cos(invLat)
          );
          mat3 rotY = mat3(
            cos(invLon), 0, sin(invLon),
            0, 1, 0,
            -sin(invLon), 0, cos(invLon)
          );
          vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
          float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
          vec4 dayColor = texture2D(dayTexture, vUv);
          vec4 nightColor = texture2D(nightTexture, vUv);
          float blendFactor = smoothstep(-0.1, 0.1, intensity);
          gl_FragColor = mix(nightColor, dayColor, blendFactor);
        }
      `};function h(t){let e=(280.46646+t*(36000.76983+3032e-7*t))%360;return e<0?e+360:e}function v(t){return 357.52911+t*(35999.05029-1537e-7*t)}function d(t){return 23+(26+(21.448-t*(46.815+t*(59e-5-.001813*t)))/60)/60+.00256*Math.cos(f(125.04-1934.136*t))}function f(t){return Math.PI*t/180}function m(t){return 180*t/Math.PI}function g(){let[t,e]=(0,s.useState)(new Date),n=(0,s.useRef)(null),[g,x]=(0,r.A)(n),w=(0,s.useEffectEvent)(async t=>{let n=Date.now();try{let[a,i]=await Promise.all([new u.Tap().loadAsync((0,o.L)("/three-globe/example/img/earth-day.png")),new u.Tap().loadAsync((0,o.L)("/three-globe/example/img/earth-night.png"))]),r=new u.BKk({uniforms:{dayTexture:{value:a},nightTexture:{value:i},sunPosition:{value:new u.I9Y},globeRotation:{value:new u.I9Y}},vertexShader:c.vertexShader,fragmentShader:c.fragmentShader});t.globeMaterial(r).backgroundImageUrl((0,o.L)("/three-globe/example/img/night-sky.png")).onZoom(({lng:t,lat:e})=>r.uniforms.globeRotation.value.set(t,e)),!function t(){var a,i,o;let l,s,u,c,g,x,w,y,p,b,M,L;n+=6e4,e(new Date(n));let R=(a=n,l=new Date(+a).setUTCHours(0,0,0,0),(i=a)instanceof Date&&(i=i.getTime()),s=(i-Date.UTC(2e3,0,1,12))/315576e7,[(l-a)/864e5*360-180-(u=d(s),c=h(s),o=s,g=.016708634-o*(42037e-9+1267e-10*o),x=v(s),w=Math.tan(f(u)/2)**2,y=Math.sin(2*f(c)),p=Math.sin(f(x)),b=Math.cos(2*f(c)),M=Math.sin(4*f(c)),4*m(w*y-2*g*p+4*g*w*p*b-.5*w*w*M-1.25*g*g*Math.sin(2*f(x)))/4),m(Math.asin(Math.sin(f(d(s)))*Math.sin(f(h(s)+(L=f(v(s)),Math.sin(L)*(1.914602-s*(.004817+14e-6*s))+Math.sin(2*L)*(.019993-101e-6*s)+289e-6*Math.sin(3*L))-.00569-.00478*Math.sin(f(125.04-1934.136*s))))))]);r.uniforms.sunPosition.value.set(R[0],R[1]),requestAnimationFrame(t)}()}catch(t){console.error("Failed to initialize scene:",t)}});return(0,s.useEffect)(()=>{let{current:t}=n;if(!t||!g||!x)return;let e=new l.A(t).width(g).height(x);return w(e),()=>{e?._destructor()}},[g,x]),(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(i.A,{ref:n}),(0,a.jsx)("div",{className:"tw:absolute tw:bottom-4 tw:left-4 tw:text-lightblue tw:font-mono tw:text-sm tw:pointer-events-none tw:text-[lightblue]",children:t.toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!1})})]})}},18031(t,e,n){n.d(e,{L:()=>i});let a="/chiyu/".replace(/\/+$/,"");function i(t){return!t.startsWith("/")||t.startsWith("//")?t:`${a}${t}`}}}]);