// Tiny DOM helpers.

export function h(tag, props, ...children) {
  // 'tag#id.class1.class2' — never pass '#'/'.' to createElement (Safari throws InvalidCharacterError)
  const [head, ...classes] = tag.split(".");
  const [name, id] = head.split("#");
  const el = document.createElement(name || "div");
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(" ");
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "style" && typeof v === "object")
        Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "value" || (k in el && typeof v !== "string")) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else
      el.appendChild(
        c instanceof Node ? c : document.createTextNode(String(c)),
      );
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

// Replace all children, skipping null/false entries (unlike Element.replaceChildren, which prints "null").
export function setChildren(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}
