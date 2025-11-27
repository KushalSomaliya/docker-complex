## Getting Started

- Ensure Skaffold is installed; on macOS run `brew install skaffold`.
- Start the iterative dev loop with `skaffold dev`.
- Once pods are ready, expose the ingress: `minikube service ingress-nginx-controller --namespace=ingress-nginx`.
- Connect to the URL minikube prints in the terminal.
