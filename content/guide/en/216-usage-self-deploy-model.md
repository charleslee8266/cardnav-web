---
title: "2.6 Deploy models yourself"
description: "Deploy downloadable AI models on rented GPUs or purchased hardware, with guidance on VRAM, quantization, installation, verification and the costs of cloud, local equipment and maintenance."
parent: choose-usage-method
next: practical-prep
---
# 2.6 Deploy models yourself

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

Deploying a model yourself means downloading its weights and running them on equipment you manage. Weights are the parameter files produced by training; generating responses with them is called inference and does not require training a model from scratch. An API gateway only forwards requests while the upstream service runs the model, so the computing and maintenance requirements differ.

This approach suits users who value data privacy or need a customized runtime or model version, but it has high technical and financial requirements. Only models with downloadable weights and a license permitting the intended use can be deployed. Closed online models such as GPT and Claude cannot simply be downloaded and hosted.

## Choose a model before deployment

A GPU, or graphics processing unit, handles parallel calculations used in inference. VRAM is the GPU’s memory and must hold the model and runtime data. Larger models and longer text inputs generally require more VRAM.

Quantization stores model parameters at lower precision to reduce file size and memory use, potentially affecting response quality. Beginners should choose a small chat model or quantized version already supported by their tools, verify that it runs, then consider larger models. Before downloading, check intended uses, licensing, file formats and resource requirements in the model documentation. Do not buy hardware based on the model name alone.

## Rent cloud GPU capacity
<!-- badge="Rent as needed" icon="vps" -->

### Who it suits

Short experiments, high VRAM requirements or trials before buying hardware. The platform supplies a GPU server; you manage model downloads, inference and access.

### Setup steps

1. Select GPU, VRAM and storage to match the model. Use a provider inference template to reduce driver installation work.
2. Check billing and budget alerts, connect through the console or SSH, and follow the tool documentation to install and start the service.
3. Download the specified weights from the publisher to persistent storage, then configure paths and startup parameters as documented.
4. Send a short question from the server and check the answer and logs. Remote access requires a protected connection and API authentication.
5. After testing, save configuration and data, stop or release the instance, and check any remaining storage charges.

### Costs

Charges cover GPU time, storage and networking. Runpod continues charging for retained volume storage after a Pod is stopped; closing the browser does not stop the instance. Shut it down promptly when work is finished.

## Use your own computer or buy equipment
<!-- badge="Run locally" icon="model" -->

### Who it suits

Frequent use, offline operation or keeping materials on the device. Try existing hardware before buying a new system.

### Setup steps

1. Check the operating system, memory and graphics hardware. Install the appropriate LM Studio version according to its hardware support documentation.
2. Use model search to choose a compatible model that fits available resources. Balance size and quality across quantized versions; the largest is not always necessary.
3. Download and load the model, start a chat and send a short question. If memory is insufficient, use a smaller model or shorten the context—the text retained and processed at one time.
4. Test quality, speed and sustained operation with real writing, coding or document tasks while monitoring memory. For command-line or program integration, see the Ollama documentation.

### Costs

Include the GPU, other system components, RAM, storage, power supply, cooling and electricity. VRAM determines how much model data fits; speed also depends on hardware and execution methods. Rent similar hardware before buying to validate your needs.

## Confirming a successful deployment

Further investment makes sense once the model loads, completes real tasks and maintains acceptable speed during continued use. Keep the model version, configuration and test results. If answer quality is insufficient, compare models and quantized versions first; adding hardware does not automatically improve model capabilities.

## References

- [LM Studio: Download a model](https://lmstudio.ai/docs/app/basics/download-model)
- [Ollama: Quickstart](https://docs.ollama.com/quickstart)
- [Runpod: Manage instances and storage charges after stopping](https://docs.runpod.io/pods/manage-pods)
