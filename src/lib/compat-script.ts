// Runs before the app, in plain old JavaScript, so it works on browsers too
// old for the app itself. It tests for the features ReedArk needs
// rather than sniffing browser names:
//   - color-mix(): the design system's colours (Chrome/Edge 111+, Firefox
//     128+, Safari 16.4+). Windows 7 and 8 are stuck on Chrome/Edge 109.
//   - container queries: projector text sizing.
//   - AudioWorklet: capturing the desk feed.
//   - BroadcastChannel: the instant console-to-projector handoff.
// If anything is missing it shows a plain banner with its own inline styles,
// so it is readable even when the page's CSS isn't.

export const compatScript = `(function(){try{
var ok=window.CSS&&CSS.supports&&CSS.supports("color","color-mix(in srgb, red, blue)")&&CSS.supports("container-type","inline-size")&&("AudioWorkletNode" in window)&&("BroadcastChannel" in window);
if(ok)return;
var show=function(){var d=document.createElement("div");d.setAttribute("role","alert");
d.style.cssText="position:fixed;inset:0 0 auto 0;z-index:2147483647;padding:16px 20px;background:#ffa42b;color:#000;font:600 15px/1.5 Arial,Helvetica,sans-serif;text-align:center";
d.innerHTML="This browser is too old for ReedArk. Please use the latest <b>Google Chrome</b> or <b>Microsoft Edge</b>.<br><span style=\\"font-weight:400\\">Windows 7 and 8 can't run current versions: the media desk PC needs Windows 10 or later, or a Mac.</span>";
document.body.appendChild(d)};
if(document.body)show();else document.addEventListener("DOMContentLoaded",show);
}catch(e){}})();`;
