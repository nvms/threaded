all: docs

docs: ## Run the docs locally with live reload
	docker build -t threads-docs .
	docker run --rm -it -p 8000:8000 -v ${PWD}:/docs threads-docs

.PHONY: docs
