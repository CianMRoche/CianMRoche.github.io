---
layout: archive
title: "Side Projects"
permalink: /side_projects/
author_profile: true
redirect_from:
  - /sideprojects
---

{% include base_path %}

### Practical Bayesian Sampling in Python and Julia

<img style="left;" src="/images/corner.png" width="500">
In this report, Markov chain Monte Carlo (MCMC) algorithms are implemented in both Python and Julia and benchmarked in both serial and parallel via a parameter fitting problem. Both the user experience of implementing and using these algorithms and the raw computational performance are considered in order to form a recommendation to young scientists interested in MCMC, in particular those with existing experience in Python. The conclusion is that although prototyping and development are faster and more transparent in python, the vast performance increases obtained in Julia even before optimization make it the better choice, in particular for large datasets or high- dimensional parameter spaces. It is found that MCMC algorithms run in Julia on a single core of a consumer laptop outperform almost identical implementations (and the popular package emcee) in python run on hundreds of cores on a supercomputing cluster.



