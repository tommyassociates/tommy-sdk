export function injectStripe () {
  if (typeof(window) === 'undefined' || window.Stripe)
    return Promise.resolve()
  return new Promise((resolve, reject) => {
    const element = document.createElement('script')
    element.setAttribute('src','https://js.stripe.com/v3/')
    element.addEventListener('load', resolve)
    document.head.appendChild(element)
  })
}
