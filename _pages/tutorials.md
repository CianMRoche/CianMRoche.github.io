---
layout: archive
title: "Tutorials"
permalink: /tutorials/
author_profile: true
redirect_from:
  - /tutorial
---

{% include base_path %}

Here is a collection of tutorials for tasks that I had trouble with at some point or another.

# A collapsible section with markdown
<details>
  <summary>Click to expand!</summary>
  
  ## Heading
  1. A numbered
  2. list
     * With some
     * Sub bullets
</details>



## Running a Jupyter Notebook on a Computing Cluster
<details>
  <summary>Click to view instructions</summary>

  Instructions courtesy of [Chelsea](https://hangchelseasu.github.io/) and [Xiaowei](https://space.mit.edu/people/ou-xiaowei/). Assume your cluster has an interactive compute node session utility, accessed by the command "idev" (interactive development, exact command changes for each cluster). The following steps allow you to use its compute resources for a jupyter notebook which is accessed locally in your personal machine's browser.  

  **1. On cluster:**  
  - Go to the directory you want to work in
  - Start an interactive session `idev -t 2:00:00` (or similar command, you can also change how much time you request)
  - Activate your python environment `conda activate env` (or equivalent)
  - Set jupyter password `jupyter notebook password` and set a simple password (you may need to do this every time).
  - Start notebook `jupyter notebook --no-browser --ip=*`

  Then note the output in that terminal, as it will give you a URL which looks like `http://hostname:YYYY` where `YYYY` is the default port on that system (can be changed if desired). You can always check what `hostname` is for your specific compute node by typing `hostname` in a terminal connected to that particular compute node.

  **2. On your local machine:**  
  - Run `ssh -fvNL XXXX:hostname:YYYY user@cluster` with the following replacements:
      - `XXXX` -> the port you wish to use on your local machine, often people use 8888, but it may be in use so try 8889 or similar
      - `hostname:YYYY` -> from the above steps
      - `user@cluster` -> the usual info you would use to ssh into that cluster. If you have an ssh config file set up you can just type the ssh HostName here[^1]
  - Go to a local browser and type `localhost:XXXX` in the URL field
  - Enter your password, and you will see the notebooks.

  [^1]: I.e. if you usually type `ssh clusterThatIWorkOn` then you can replace `user@cluster` above with `clusterThatIWorkOn`
</details>
